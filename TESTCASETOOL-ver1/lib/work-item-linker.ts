/**
 * Automatic Work Item Linking for Azure DevOps
 * Link test cases to requirements, bugs, and user stories
 */

import { AzureDevOpsConfig } from '@/types';
import axios, { AxiosInstance } from 'axios';

export type LinkType =
  | 'System.LinkTypes.Related'
  | 'Microsoft.VSTS.Common.TestedBy'
  | 'System.LinkTypes.Hierarchy-Reverse'
  | 'Microsoft.VSTS.Common.Tests'
  | 'System.LinkTypes.Duplicate'
  | 'System.LinkTypes.DuplicateOf';

export interface WorkItemLink {
  rel: LinkType;
  url: string;
  attributes?: Record<string, any>;
}

export interface LinkRequest {
  sourceWorkItemId: number;
  targetWorkItemId: number;
  linkType: LinkType;
  comment?: string;
}

export class WorkItemLinker {
  private client: AxiosInstance;
  private config: AzureDevOpsConfig;
  private baseUrl: string;
  private apiVersion: string;

  constructor(config: AzureDevOpsConfig) {
    this.config = config;
    this.apiVersion = config.apiVersion || '7.0';

    // Build base URL
    const isTFS = config.organizationUrl.includes('/tfs') || !config.organizationUrl.includes('dev.azure.com');

    try {
      const inputUrl = config.organizationUrl.replace(/\/$/, '');
      const parsed = new URL(inputUrl);
      const origin = parsed.origin;
      const pathParts = parsed.pathname.split('/').filter(Boolean);

      const tfsIndex = pathParts.indexOf('tfs');
      const collectionFromUrl = tfsIndex >= 0 && pathParts.length > tfsIndex + 1 ? pathParts[tfsIndex + 1] : undefined;

      const collection = config.collectionName || collectionFromUrl;

      if (isTFS) {
        if (collection) {
          this.baseUrl = `${origin}/tfs/${collection}/${config.projectName}/_apis`;
        } else {
          this.baseUrl = `${inputUrl}/${config.projectName}/_apis`;
        }
      } else {
        this.baseUrl = `${inputUrl}/${config.projectName}/_apis`;
      }
    } catch (err) {
      this.baseUrl = `${config.organizationUrl.replace(/\/$/, '')}/${config.projectName}/_apis`;
    }

    const encodedToken = Buffer.from(`:${config.patToken}`).toString('base64');

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Basic ${encodedToken}`,
        'Content-Type': 'application/json-patch+json',
      },
      httpAgent: isTFS ? { rejectUnauthorized: false } : undefined,
      httpsAgent: isTFS ? { rejectUnauthorized: false } : undefined,
    });
  }

  /**
   * Link a test case to a work item (requirement, bug, user story)
   */
  async linkTestCase(request: LinkRequest): Promise<void> {
    try {
      // Get work item URL
      const sourceWorkItem = await this.getWorkItem(request.sourceWorkItemId);
      const sourceUrl = sourceWorkItem.url;

      // Create link operation
      const operations = [
        {
          op: 'add',
          path: '/relations/-',
          value: {
            rel: request.linkType,
            url: sourceUrl,
            attributes: request.comment ? { comment: request.comment } : undefined,
          },
        },
      ];

      // Add link to target work item
      await this.client.patch(
        `/wit/workitems/${request.targetWorkItemId}?api-version=${this.apiVersion}`,
        operations
      );

      console.log(
        `[WorkItemLinker] Linked test case ${request.sourceWorkItemId} to work item ${request.targetWorkItemId} as ${request.linkType}`
      );
    } catch (error) {
      console.error('[WorkItemLinker] Failed to link work items:', error);
      throw error;
    }
  }

  /**
   * Unlink work items
   */
  async unlinkTestCase(
    sourceWorkItemId: number,
    targetWorkItemId: number,
    linkType: LinkType
  ): Promise<void> {
    try {
      // Get work item to find relation ID
      const workItem = await this.getWorkItem(targetWorkItemId);
      const relationId = this.findRelationId(workItem, sourceWorkItemId, linkType);

      if (!relationId) {
        throw new Error('Link not found');
      }

      // Remove link
      const operations = [
        {
          op: 'remove',
          path: `/relations/${relationId}`,
        },
      ];

      await this.client.patch(
        `/wit/workitems/${targetWorkItemId}?api-version=${this.apiVersion}`,
        operations
      );

      console.log(
        `[WorkItemLinker] Unlinked test case ${sourceWorkItemId} from work item ${targetWorkItemId}`
      );
    } catch (error) {
      console.error('[WorkItemLinker] Failed to unlink work items:', error);
      throw error;
    }
  }

  /**
   * Get all linked work items for a test case
   */
  async getLinkedWorkItems(testCaseId: number): Promise<WorkItemLink[]> {
    try {
      const workItem = await this.getWorkItem(testCaseId);

      const links: WorkItemLink[] = (workItem.relations || []).map((rel: any) => ({
        rel: rel.rel as LinkType,
        url: rel.url,
        attributes: rel.attributes,
      }));

      return links;
    } catch (error) {
      console.error('[WorkItemLinker] Failed to get linked work items:', error);
      throw error;
    }
  }

  /**
   * Get work item by ID
   */
  private async getWorkItem(workItemId: number): Promise<any> {
    try {
      const response = await this.client.get(
        `/wit/workitems/${workItemId}?api-version=${this.apiVersion}&$expand=relations`
      );
      return response.data;
    } catch (error) {
      console.error(`[WorkItemLinker] Failed to fetch work item ${workItemId}:`, error);
      throw error;
    }
  }

  /**
   * Find relation ID by source ID and link type
   */
  private findRelationId(
    workItem: any,
    sourceId: number,
    linkType: LinkType
  ): string | undefined {
    const relations = workItem.relations || [];

    for (const relation of relations) {
      if (relation.rel === linkType) {
        // Parse work item ID from URL
        const match = relation.url.match(/\/workitems\/(\d+)$/);
        if (match && parseInt(match[1], 10) === sourceId) {
          return relation.rel; // Return the relation type as ID
        }
      }
    }

    return undefined;
  }

  /**
   * Get link type display name
   */
  static getLinkTypeLabel(linkType: LinkType): string {
    const labels: Record<LinkType, string> = {
      'System.LinkTypes.Related': 'Related',
      'Microsoft.VSTS.Common.TestedBy': 'Tested By',
      'System.LinkTypes.Hierarchy-Reverse': 'Parent Of',
      'Microsoft.VSTS.Common.Tests': 'Tests',
      'System.LinkTypes.Duplicate': 'Duplicate Of',
      'System.LinkTypes.DuplicateOf': 'Duplicated By',
    };

    return labels[linkType] || linkType;
  }

  /**
   * Get recommended link type for work item type
   */
  static getRecommendedLinkType(
    sourceType: string,
    targetType: string
  ): LinkType {
    // Test Case → Requirement
    if (sourceType === 'Test Case' && targetType === 'User Story') {
      return 'Microsoft.VSTS.Common.TestedBy';
    }

    // Test Case → Bug
    if (sourceType === 'Test Case' && targetType === 'Bug') {
      return 'System.LinkTypes.Related';
    }

    // Default
    return 'System.LinkTypes.Related';
  }
}
