/**
 * Формы домена, на которые ссылается код.
 *
 * Файл долго лежал описанием: семь объявлений, ни одной ссылки. Описание,
 * которое ничего не сторожит, расходится с кодом молча, поэтому типы отсюда
 * подключены через JSDoc там, где эти формы и живут:
 *
 *   `LeakStatus`       — `utils/status`, и через него весь жизненный цикл
 *   `LeakRecord`       — `utils/leakOrder`, `utils/monitoring`
 *   `MonitoringRecord` — `utils/monitoring`
 *   `ProjectMetadata`  — `app/project/projectStorage`
 *   `WebDataEnvelope`  — `repositories/webProjectEnvelope`
 *   `ImportOperation`  — `services/import/importOperationJournal`
 *
 * `domain/` и `utils/` проверяются со strictNullChecks, так что ссылки оттуда
 * ловят не только несовпадение полей, но и пропущенный `undefined`. Первое же
 * подключение нашло две вещи: статус, приходивший в `PhotoBlock` нетипизированной
 * строкой, и чтение `record.date` там, где тип разрешал его отсутствие.
 *
 * `types/domain.test.js` следит, чтобы ссылки не исчезли, — иначе файл снова
 * станет описанием.
 */

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
  previousPhoto?: string | null;
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
