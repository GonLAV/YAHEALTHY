import request from 'supertest';
import app from '../src/index';

// Mock the AdoClient used by the API (use require.resolve for reliable resolution)
jest.mock('../src/adoClientAdapter', () => {
  return {
    AdoClient: jest.fn().mockImplementation(() => ({
      getWorkItem: jest.fn().mockResolvedValue({ id: 1, fields: { 'System.Title': 'T' } }),
      queryByWiql: jest.fn().mockResolvedValue({ workItems: [{ id: 1 }] }),
      createTestRun: jest.fn().mockResolvedValue({ id: 55 }),
      addTestResults: jest.fn().mockResolvedValue({ count: 1 }),
      uploadAttachment: jest.fn().mockResolvedValue({ id: 999 }),
    })),
  };
});

describe('API proxy', () => {
  it('returns a work item', async () => {
    const res = await request(app).get('/api/workitems/1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
  });

  it('executes WIQL', async () => {
    const res = await request(app).post('/api/wiql').send({ query: 'Select [System.Id] FROM WorkItems' });
    expect(res.status).toBe(200);
    expect(res.body.workItems).toBeDefined();
  });

  it('creates a test run', async () => {
    const res = await request(app).post('/api/test-runs').send({ name: 'run' });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(55);
  });

  it('adds test results', async () => {
    const res = await request(app).post('/api/test-runs/55/results').send([{ outcome: 'Passed' }]);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });

  it('uploads attachment', async () => {
    const res = await request(app)
      .post('/api/test-runs/55/attachments?fileName=log.txt')
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('hello'));

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(999);
  });
});
