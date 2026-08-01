export type ProjectType = "upstream" | "midstream" | "downstream";
export type LeakStatus = "open" | "in_progress" | "resolved";

export interface ProjectMetadata {
  id: string;
  name: string;
  type: ProjectType;
  folderName: string;
  createdAt: number;
  syncId?: string;
  legacyStorageType?: ProjectType;
}

export interface MonitoringRecord {
  id: string | number;
  date?: string;
  photo?: string | null;
  [field: string]: unknown;
}

export interface LeakRecord {
  id: string | number;
  status: LeakStatus;
  lat?: number | null;
  lng?: number | null;
  photo?: string | null;
  photo_after?: string | null;
  photo_repair?: string | null;
  monitoringRecords?: MonitoringRecord[];
  [field: string]: unknown;
}

export interface WebDataEnvelope {
  version: number;
  revision: number;
  updatedAt: number;
  deleted: boolean;
  checksum: string;
  data: LeakRecord[];
}

export interface ImportOperation {
  operationId: string;
  projectId: string;
  phase: "preparing" | "committing" | "rolling_back" | "complete";
  previousRevision?: number;
  targetRevision?: number;
  createdPhotoPaths: string[];
  updatedAt: number;
}
