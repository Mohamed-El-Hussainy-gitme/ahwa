export interface DeviceGateResolveRequest {
  readonly slug: string;
}

export interface DeviceGateActivateRequest {
  readonly slug: string;
  readonly pairingCode: string;
  readonly label: string;
  readonly deviceType: "mobile_phone" | "tablet" | "desktop" | "kiosk";
  readonly deviceMode?: "shared_runtime" | "station_only" | "owner_private";
  readonly stationType?: "barista" | "shisha" | "kitchen" | "service";
  readonly platformName?: string;
  readonly browserName?: string;
  readonly appVersion?: string;
  readonly fingerprint?: string;
}

export interface OwnerLoginRequest {
  readonly slug: string;
  readonly identifier: string;
  readonly password: string;
  readonly deviceToken?: string;
}

export interface EmployeePinLoginRequest {
  readonly deviceToken: string;
  readonly identifier: string;
  readonly pin: string;
}

export interface SuperAdminLoginRequest {
  readonly email: string;
  readonly password: string;
}
