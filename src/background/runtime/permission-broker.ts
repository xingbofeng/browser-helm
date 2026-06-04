export type ChromePermissionsApi = {
  contains?: (permissions: { permissions?: string[]; origins?: string[] }) => boolean | Promise<boolean>;
  getAll?: () => Promise<{ permissions?: string[]; origins?: string[] }>;
  request?: (permissions: { permissions?: string[]; origins?: string[] }) => boolean | Promise<boolean>;
};

export type ChromePermissionBrokerApi = {
  permissions?: ChromePermissionsApi | undefined;
};

export type PermissionRequest = {
  permissions?: string[] | undefined;
  origins?: string[] | undefined;
};

export type PermissionRequestResult = {
  granted: boolean;
  permissions: string[];
  origins: string[];
};

export class ChromePermissionBroker {
  constructor(
    private readonly chromeApi: ChromePermissionBrokerApi | undefined =
      globalThis.chrome as unknown as ChromePermissionBrokerApi | undefined
  ) {}

  isAvailable(): boolean {
    return Boolean(this.chromeApi?.permissions?.contains && this.chromeApi.permissions.getAll);
  }

  async hasPermission(permission: string): Promise<boolean> {
    try {
      return await this.chromeApi?.permissions?.contains?.({ permissions: [permission] }) === true;
    } catch {
      return false;
    }
  }

  async getGrantedOrigins(): Promise<string[]> {
    try {
      const granted = await this.chromeApi?.permissions?.getAll?.();
      return Array.isArray(granted?.origins)
        ? granted.origins.filter((origin): origin is string => typeof origin === 'string' && origin.length > 0)
        : [];
    } catch {
      return [];
    }
  }

  async requestPermissions(request: PermissionRequest): Promise<PermissionRequestResult> {
    const permissions = request.permissions ?? [];
    const origins = request.origins ?? [];
    try {
      const granted = await this.chromeApi?.permissions?.request?.({
        ...(permissions.length ? { permissions } : {}),
        ...(origins.length ? { origins } : {})
      }) === true;
      return { granted, permissions, origins };
    } catch {
      return { granted: false, permissions, origins };
    }
  }
}
