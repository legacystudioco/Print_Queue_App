import { describe, expect, it } from 'vitest';
import { deliverPrintCommandPayloadSchema, printerCommandPayloadSchemas, startPrintCommandPayloadSchema } from './command';

const validPayload = {
  jobId: '11111111-1111-1111-1111-111111111111',
  storagePath: 'jobs/11111111/plate.gcode',
  originalFilename: 'plate.gcode',
};

describe('deliverPrintCommandPayloadSchema', () => {
  it('accepts the same shape as start_print', () => {
    expect(deliverPrintCommandPayloadSchema.parse(validPayload)).toEqual(validPayload);
    expect(startPrintCommandPayloadSchema.parse(validPayload)).toEqual(validPayload);
  });

  it('rejects a payload missing required fields', () => {
    expect(() => deliverPrintCommandPayloadSchema.parse({})).toThrow();
  });
});

describe('printerCommandPayloadSchemas', () => {
  it('has an entry for every printer command type', () => {
    expect(Object.keys(printerCommandPayloadSchemas).sort()).toEqual(
      ['cancel_print', 'deliver_print', 'pause_print', 'refresh_status', 'resume_print', 'start_print'].sort(),
    );
  });

  it('validates a deliver_print command payload through the map', () => {
    expect(printerCommandPayloadSchemas.deliver_print.parse(validPayload)).toEqual(validPayload);
  });
});
