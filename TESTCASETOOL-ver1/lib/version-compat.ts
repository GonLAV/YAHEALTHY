/**
 * Version Compatibility Layer
 * Supports multiple Azure DevOps and TFS versions with feature detection
 */

export type AdoVersion = 'tfs-2018' | 'tfs-2019' | 'azdo-2019' | 'azdo-2020' | 'azdo-2021' | 'azdo-2022' | 'azdo-cloud';

export interface VersionCapabilities {
  version: AdoVersion;
  name: string;
  releaseDate: Date;
  apiVersion: string;
  supportedFeatures: {
    workItems: boolean;
    testManagement: boolean;
    testPlans: boolean;
    testSuites: boolean;
    resultTracking: boolean;
    attachments: boolean;
    relations: boolean;
    tags: boolean;
    areaPath: boolean;
    iterationPath: boolean;
    customFields: boolean;
    webhooks: boolean;
    graphApi: boolean;
  };
  limitations: string[];
}

export class VersionCompatibilityLayer {
  private versions: Map<AdoVersion, VersionCapabilities> = new Map([
    [
      'tfs-2018',
      {
        version: 'tfs-2018',
        name: 'TFS 2018',
        releaseDate: new Date('2018-01-01'),
        apiVersion: '3.2',
        supportedFeatures: {
          workItems: true,
          testManagement: true,
          testPlans: true,
          testSuites: true,
          resultTracking: true,
          attachments: true,
          relations: true,
          tags: true,
          areaPath: true,
          iterationPath: true,
          customFields: true,
          webhooks: false,
          graphApi: false,
        },
        limitations: [
          'Limited test result tracking',
          'No Graph API support',
          'Basic webhook support',
        ],
      },
    ],
    [
      'tfs-2019',
      {
        version: 'tfs-2019',
        name: 'TFS 2019',
        releaseDate: new Date('2019-01-01'),
        apiVersion: '5.0',
        supportedFeatures: {
          workItems: true,
          testManagement: true,
          testPlans: true,
          testSuites: true,
          resultTracking: true,
          attachments: true,
          relations: true,
          tags: true,
          areaPath: true,
          iterationPath: true,
          customFields: true,
          webhooks: true,
          graphApi: false,
        },
        limitations: [
          'No Graph API support',
          'Limited cloud features',
        ],
      },
    ],
    [
      'azdo-2019',
      {
        version: 'azdo-2019',
        name: 'Azure DevOps 2019',
        releaseDate: new Date('2019-12-01'),
        apiVersion: '5.1',
        supportedFeatures: {
          workItems: true,
          testManagement: true,
          testPlans: true,
          testSuites: true,
          resultTracking: true,
          attachments: true,
          relations: true,
          tags: true,
          areaPath: true,
          iterationPath: true,
          customFields: true,
          webhooks: true,
          graphApi: true,
        },
        limitations: [],
      },
    ],
    [
      'azdo-2020',
      {
        version: 'azdo-2020',
        name: 'Azure DevOps 2020',
        releaseDate: new Date('2020-11-16'),
        apiVersion: '6.0',
        supportedFeatures: {
          workItems: true,
          testManagement: true,
          testPlans: true,
          testSuites: true,
          resultTracking: true,
          attachments: true,
          relations: true,
          tags: true,
          areaPath: true,
          iterationPath: true,
          customFields: true,
          webhooks: true,
          graphApi: true,
        },
        limitations: [],
      },
    ],
    [
      'azdo-2021',
      {
        version: 'azdo-2021',
        name: 'Azure DevOps 2021',
        releaseDate: new Date('2021-10-18'),
        apiVersion: '6.1',
        supportedFeatures: {
          workItems: true,
          testManagement: true,
          testPlans: true,
          testSuites: true,
          resultTracking: true,
          attachments: true,
          relations: true,
          tags: true,
          areaPath: true,
          iterationPath: true,
          customFields: true,
          webhooks: true,
          graphApi: true,
        },
        limitations: [],
      },
    ],
    [
      'azdo-2022',
      {
        version: 'azdo-2022',
        name: 'Azure DevOps 2022',
        releaseDate: new Date('2022-11-07'),
        apiVersion: '7.0',
        supportedFeatures: {
          workItems: true,
          testManagement: true,
          testPlans: true,
          testSuites: true,
          resultTracking: true,
          attachments: true,
          relations: true,
          tags: true,
          areaPath: true,
          iterationPath: true,
          customFields: true,
          webhooks: true,
          graphApi: true,
        },
        limitations: [],
      },
    ],
    [
      'azdo-cloud',
      {
        version: 'azdo-cloud',
        name: 'Azure DevOps Cloud (Latest)',
        releaseDate: new Date(),
        apiVersion: '7.1',
        supportedFeatures: {
          workItems: true,
          testManagement: true,
          testPlans: true,
          testSuites: true,
          resultTracking: true,
          attachments: true,
          relations: true,
          tags: true,
          areaPath: true,
          iterationPath: true,
          customFields: true,
          webhooks: true,
          graphApi: true,
        },
        limitations: [],
      },
    ],
  ]);

  private currentVersion: AdoVersion = 'azdo-cloud';

  /**
   * Set current version
   */
  setVersion(version: AdoVersion): void {
    if (!this.versions.has(version)) {
      throw new Error(`Unsupported version: ${version}`);
    }
    this.currentVersion = version;
  }

  /**
   * Get current version
   */
  getCurrentVersion(): AdoVersion {
    return this.currentVersion;
  }

  /**
   * Get version capabilities
   */
  getCapabilities(version?: AdoVersion): VersionCapabilities | undefined {
    const v = version || this.currentVersion;
    return this.versions.get(v);
  }

  /**
   * Check if feature is supported
   */
  isFeatureSupported(feature: keyof VersionCapabilities['supportedFeatures'], version?: AdoVersion): boolean {
    const caps = this.getCapabilities(version);
    if (!caps) return false;

    return caps.supportedFeatures[feature] || false;
  }

  /**
   * Detect version from API response
   */
  detectVersion(apiResponse: any): AdoVersion {
    // Try to detect from response headers or body
    const apiVersion = apiResponse?.apiVersion || apiResponse?.version;

    if (apiVersion?.includes('7.1') || apiVersion?.includes('7')) {
      return 'azdo-cloud';
    }
    if (apiVersion?.includes('6.1') || apiVersion?.includes('6')) {
      return 'azdo-2021';
    }
    if (apiVersion?.includes('5.1') || apiVersion?.includes('5')) {
      return 'azdo-2019';
    }

    return 'azdo-cloud';
  }

  /**
   * Get API version string for requests
   */
  getApiVersionString(version?: AdoVersion): string {
    const caps = this.getCapabilities(version);
    return caps ? `${caps.apiVersion}-preview.3` : '7.1-preview.3';
  }

  /**
   * Get appropriate endpoint for version
   */
  getEndpoint(
    baseUrl: string,
    resource: 'wit' | 'test' | 'tfvc' | 'git',
    version?: AdoVersion
  ): string {
    const apiVersion = this.getApiVersionString(version);
    return `${baseUrl}/_apis/${resource}?api-version=${apiVersion}`;
  }

  /**
   * Transform payload for version compatibility
   */
  transformPayload(payload: any, sourceVersion: AdoVersion, targetVersion: AdoVersion): any {
    // Ensure required fields exist in all versions
    const transformed = { ...payload };

    const sourceCaps = this.getCapabilities(sourceVersion);
    const targetCaps = this.getCapabilities(targetVersion);

    if (!sourceCaps || !targetCaps) return payload;

    // Remove unsupported fields for target version
    if (!targetCaps.supportedFeatures.tags && transformed.tags) {
      delete transformed.tags;
    }

    if (!targetCaps.supportedFeatures.relations && transformed.relations) {
      delete transformed.relations;
    }

    if (!targetCaps.supportedFeatures.customFields && transformed.fields) {
      // Keep only standard fields
      const standardFields = ['System.Title', 'System.Description', 'System.State'];
      transformed.fields = Object.fromEntries(
        Object.entries(transformed.fields).filter(([key]) =>
          standardFields.some((sf) => key.includes(sf))
        )
      );
    }

    return transformed;
  }

  /**
   * Get migration path between versions
   */
  getMigrationPath(fromVersion: AdoVersion, toVersion: AdoVersion): AdoVersion[] {
    const allVersions = Array.from(this.versions.keys());
    const fromIdx = allVersions.indexOf(fromVersion);
    const toIdx = allVersions.indexOf(toVersion);

    if (fromIdx === -1 || toIdx === -1) {
      return [];
    }

    if (fromIdx < toIdx) {
      return allVersions.slice(fromIdx, toIdx + 1);
    } else {
      return allVersions.slice(toIdx, fromIdx + 1).reverse();
    }
  }

  /**
   * Check version compatibility
   */
  isCompatible(sourceVersion: AdoVersion, targetVersion: AdoVersion): boolean {
    const source = this.getCapabilities(sourceVersion);
    const target = this.getCapabilities(targetVersion);

    if (!source || !target) return false;

    // Check if target has all features of source
    const features = Object.keys(source.supportedFeatures) as Array<keyof VersionCapabilities['supportedFeatures']>;

    return features.every(
      (feature) =>
        !source.supportedFeatures[feature] || target.supportedFeatures[feature]
    );
  }

  /**
   * Get all supported versions
   */
  getSupportedVersions(): AdoVersion[] {
    return Array.from(this.versions.keys());
  }

  /**
   * Get version info for display
   */
  getVersionInfo(version?: AdoVersion): Record<string, any> {
    const caps = this.getCapabilities(version);
    if (!caps) return {};

    return {
      name: caps.name,
      apiVersion: caps.apiVersion,
      releaseDate: caps.releaseDate.toLocaleDateString(),
      supportedFeatures: Object.entries(caps.supportedFeatures)
        .filter(([_, supported]) => supported)
        .map(([feature]) => feature),
      limitations: caps.limitations,
    };
  }

  /**
   * Handle version-specific error responses
   */
  handleVersionError(error: any, version?: AdoVersion): string {
    const caps = this.getCapabilities(version);

    // Version-specific error messages
    if (version === 'tfs-2018' && error?.statusCode === 404) {
      return 'Feature not available in TFS 2018. Please upgrade to Azure DevOps.';
    }

    if (error?.message?.includes('graphapi')) {
      return 'Graph API not supported in this version. Update to Azure DevOps 2019 or later.';
    }

    return error?.message || 'Unknown error';
  }

  /**
   * Validate version-specific payload
   */
  validatePayload(
    payload: any,
    version?: AdoVersion
  ): { valid: boolean; errors: string[] } {
    const caps = this.getCapabilities(version);
    if (!caps) return { valid: false, errors: ['Unknown version'] };

    const errors: string[] = [];

    if (payload.tags && !caps.supportedFeatures.tags) {
      errors.push(`Tags not supported in ${caps.name}`);
    }

    if (payload.relations && !caps.supportedFeatures.relations) {
      errors.push(`Relations not supported in ${caps.name}`);
    }

    if (payload.customFields && !caps.supportedFeatures.customFields) {
      errors.push(`Custom fields not supported in ${caps.name}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
