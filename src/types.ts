// WiFi Types
export interface Network {
  bssid: string;
  frequency: number;
  signal: number;
  flags: string;
  ssid: string;
}

export interface SavedNetwork {
  networkId: number;
  ssid: string;
  bssid: string;
  flags: string;
}

export interface ConnectionStatus {
  wpaState: string;
  ssid?: string;
  bssid?: string;
  ipAddress?: string;
  frequency?: number;
  keyManagement?: string;
}

// Connectivity Types
export interface PingResult {
  host: string;
  alive: boolean;
  time?: number;
  output: string;
}

export interface DnsResult {
  hostname: string;
  addresses: string[];
}

// Browser Types
export interface ScriptInfo {
  name: string;
  path: string;
}

export interface ScriptVariables {
  [key: string]: string;
}
