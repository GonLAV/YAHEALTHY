/**
 * Attachments Library Manager
 * Handles file uploads, syncing with Azure DevOps, and metadata tracking
 */

import axios, { AxiosError } from 'axios';

export interface Attachment {
  id: string;
  name: string;
  size: number; // bytes
  mimeType: string;
  uploadedAt: Date;
  url?: string;
  adoAttachmentId?: string; // ID in Azure DevOps
  isLocal?: boolean; // Not yet synced to ADO
  lastSyncedAt?: Date;
  content?: ArrayBuffer; // For local storage
}

export interface AttachmentUploadResult {
  success: boolean;
  attachment?: Attachment;
  error?: string;
  adoUrl?: string;
}

export interface AttachmentSyncStatus {
  totalAttachments: number;
  syncedCount: number;
  pendingCount: number;
  failedCount: number;
  lastSyncTime?: Date;
}

export class AttachmentsManager {
  private attachments: Map<string, Attachment> = new Map();
  private maxFileSize: number = 60 * 1024 * 1024; // 60 MB ADO limit
  private allowedMimeTypes: Set<string> = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'text/plain',
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip',
    'application/x-rar-compressed',
    'application/x-7z-compressed',
  ]);

  /**
   * Add attachment from file
   */
  async addAttachment(file: File): Promise<AttachmentUploadResult> {
    try {
      // Validate file
      const validation = this.validateFile(file);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      // Read file content
      const content = await this.readFile(file);

      const attachment: Attachment = {
        id: this.generateId(),
        name: file.name,
        size: file.size,
        mimeType: file.type,
        uploadedAt: new Date(),
        isLocal: true,
        content,
      };

      this.attachments.set(attachment.id, attachment);

      return {
        success: true,
        attachment,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to process file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Upload attachment to Azure DevOps
   */
  async uploadToAdo(
    attachmentId: string,
    projectUrl: string,
    pat: string
  ): Promise<AttachmentUploadResult> {
    const attachment = this.attachments.get(attachmentId);
    if (!attachment) {
      return { success: false, error: 'Attachment not found' };
    }

    try {
      const url = `${projectUrl}/_apis/wit/attachments?api-version=7.1-preview.3`;

      // Convert ArrayBuffer to Blob for upload
      const blob = new Blob([attachment.content || new ArrayBuffer(0)], {
        type: attachment.mimeType,
      });

      const response = await axios.post(url, blob, {
        headers: {
          'Content-Type': attachment.mimeType,
          Authorization: `Basic ${Buffer.from(`:${pat}`).toString('base64')}`,
        },
      });

      attachment.adoAttachmentId = response.data.id;
      attachment.url = response.data.url;
      attachment.isLocal = false;
      attachment.lastSyncedAt = new Date();

      this.attachments.set(attachmentId, attachment);

      return {
        success: true,
        attachment,
        adoUrl: response.data.url,
      };
    } catch (error) {
      const axiosError = error as AxiosError;
      return {
        success: false,
        error: `Failed to upload to Azure DevOps: ${axiosError.message}`,
      };
    }
  }

  /**
   * Sync local attachments to Azure DevOps
   */
  async syncToAdo(
    projectUrl: string,
    pat: string
  ): Promise<AttachmentSyncStatus> {
    const status: AttachmentSyncStatus = {
      totalAttachments: this.attachments.size,
      syncedCount: 0,
      pendingCount: 0,
      failedCount: 0,
      lastSyncTime: new Date(),
    };

    for (const attachment of this.attachments.values()) {
      if (attachment.isLocal) {
        status.pendingCount++;
        const result = await this.uploadToAdo(attachment.id, projectUrl, pat);

        if (result.success) {
          status.syncedCount++;
        } else {
          status.failedCount++;
        }
      }
    }

    return status;
  }

  /**
   * Attach file to work item in Azure DevOps
   */
  async attachToWorkItem(
    attachmentId: string,
    projectUrl: string,
    workItemId: number,
    pat: string
  ): Promise<boolean> {
    const attachment = this.attachments.get(attachmentId);
    if (!attachment || !attachment.adoAttachmentId) {
      throw new Error('Attachment not found or not uploaded to ADO');
    }

    try {
      const url = `${projectUrl}/_apis/wit/workitems/${workItemId}?api-version=7.1-preview.3`;

      const patch = [
        {
          op: 'add',
          path: `/relations/-`,
          value: {
            rel: 'AttachedFile',
            url: attachment.url,
            attributes: {
              name: attachment.name,
            },
          },
        },
      ];

      await axios.patch(url, patch, {
        headers: {
          Authorization: `Basic ${Buffer.from(`:${pat}`).toString('base64')}`,
          'Content-Type': 'application/json-patch+json',
        },
      });

      return true;
    } catch (error) {
      console.error('Failed to attach file to work item:', error);
      return false;
    }
  }

  /**
   * Download attachment
   */
  async downloadAttachment(attachmentId: string): Promise<Blob | null> {
    const attachment = this.attachments.get(attachmentId);
    if (!attachment) return null;

    if (attachment.content) {
      return new Blob([attachment.content], { type: attachment.mimeType });
    }

    if (attachment.url) {
      try {
        const response = await axios.get(attachment.url, {
          responseType: 'blob',
        });
        return response.data as Blob;
      } catch (error) {
        console.error('Failed to download attachment:', error);
        return null;
      }
    }

    return null;
  }

  /**
   * Remove attachment
   */
  removeAttachment(attachmentId: string): boolean {
    return this.attachments.delete(attachmentId);
  }

  /**
   * Get all attachments
   */
  getAttachments(): Attachment[] {
    return Array.from(this.attachments.values());
  }

  /**
   * Get attachment by ID
   */
  getAttachment(attachmentId: string): Attachment | undefined {
    return this.attachments.get(attachmentId);
  }

  /**
   * Get storage usage
   */
  getStorageUsage(): {
    usedBytes: number;
    localBytes: number;
    syncedBytes: number;
    maxBytes: number;
    percentUsed: number;
  } {
    let usedBytes = 0;
    let localBytes = 0;
    let syncedBytes = 0;

    this.attachments.forEach((att) => {
      usedBytes += att.size;
      if (att.isLocal) {
        localBytes += att.size;
      } else {
        syncedBytes += att.size;
      }
    });

    return {
      usedBytes,
      localBytes,
      syncedBytes,
      maxBytes: this.maxFileSize,
      percentUsed: (usedBytes / this.maxFileSize) * 100,
    };
  }

  /**
   * Clear local attachments not yet synced
   */
  clearLocalAttachments(): number {
    let count = 0;
    for (const [id, att] of this.attachments) {
      if (att.isLocal && !att.adoAttachmentId) {
        this.attachments.delete(id);
        count++;
      }
    }
    return count;
  }

  /**
   * Export attachment metadata for backup
   */
  exportMetadata(): string {
    const metadata = Array.from(this.attachments.values()).map((att) => ({
      id: att.id,
      name: att.name,
      size: att.size,
      mimeType: att.mimeType,
      uploadedAt: att.uploadedAt.toISOString(),
      adoAttachmentId: att.adoAttachmentId,
      isLocal: att.isLocal,
      lastSyncedAt: att.lastSyncedAt?.toISOString(),
    }));

    return JSON.stringify(metadata, null, 2);
  }

  /**
   * Private: Validate file
   */
  private validateFile(
    file: File
  ): { valid: boolean; error?: string } {
    if (file.size > this.maxFileSize) {
      return {
        valid: false,
        error: `File size exceeds ${this.maxFileSize / (1024 * 1024)}MB limit`,
      };
    }

    if (!this.allowedMimeTypes.has(file.type)) {
      return {
        valid: false,
        error: `File type ${file.type} not allowed. Supported: PDF, Office, Images, Archives`,
      };
    }

    return { valid: true };
  }

  /**
   * Private: Read file as ArrayBuffer
   */
  private readFile(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        resolve(e.target?.result as ArrayBuffer);
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Private: Generate unique ID
   */
  private generateId(): string {
    return `att_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
