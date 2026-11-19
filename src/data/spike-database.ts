import Dexie, { Table } from 'dexie';

export interface SpikeRecord {
  id?: number;
  message: string;
  createdAt: string;
}

export class SpikeDatabase extends Dexie {
  spikeRecords!: Table<SpikeRecord, number>;

  constructor() {
    super('fast-seven-spike');
    this.version(1).stores({
      spikeRecords: '++id, createdAt',
    });
  }
}

export const spikeDatabase = new SpikeDatabase();
