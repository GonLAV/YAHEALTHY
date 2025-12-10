import express from 'express';
import bodyParser from 'body-parser';
import { AdoClient } from './adoClientAdapter';
import express from 'express';
import bodyParser from 'body-parser';
import { AdoClient } from '../../packages/ado-client/src/client';

const app = express();
app.use(bodyParser.json());

function buildClient() {
  const org = process.env.ADO_ORG_URL || 'http://localhost:8080';
  const project = process.env.ADO_PROJECT || '';
  const pat = process.env.ADO_PAT;
  return new AdoClient({ organizationUrl: org, projectName: project, patToken: pat });
}

app.get('/api/workitems/:id', async (req, res) => {
  const id = Number(req.params.id);
  const client = buildClient();

  try {
    const wi = await client.getWorkItem(id);
    res.json(wi);
  } catch (err: any) {
    res.status(err?.status || 500).json({ error: err?.message || 'unknown' });
  }
});

app.post('/api/wiql', async (req, res) => {
  const { query } = req.body || {};
  if (!query) return res.status(400).json({ error: 'query required' });

  const client = buildClient();
  try {
    const result = await client.queryByWiql(query);
    res.json(result);
  } catch (err: any) {
    res.status(err?.status || 500).json({ error: err?.message || 'unknown' });
  }
});

app.post('/api/test-runs', async (req, res) => {
  const run = req.body;
  const client = buildClient();

  try {
    const created = await client.createTestRun(run);
    res.json(created);
  } catch (err: any) {
    res.status(err?.status || 500).json({ error: err?.message || 'unknown' });
  }
});

app.post('/api/test-runs/:runId/results', async (req, res) => {
  const runId = Number(req.params.runId);
  const results = req.body;
  const client = buildClient();

  try {
    const r = await client.addTestResults(runId, results);
    res.json(r);
  } catch (err: any) {
    res.status(err?.status || 500).json({ error: err?.message || 'unknown' });
  }
});

// Upload attachment (expect raw octet-stream body)
app.post(
  '/api/test-runs/:runId/attachments',
  express.raw({ type: 'application/octet-stream', limit: '50mb' }),
  async (req, res) => {
    const runId = Number(req.params.runId);
    const fileName = req.query.fileName ? String(req.query.fileName) : 'attachment.bin';
    const client = buildClient();

    try {
      const data = req.body as Buffer;
      const out = await client.uploadAttachment(runId, fileName, data);
      res.json(out);
    } catch (err: any) {
      res.status(err?.status || 500).json({ error: err?.message || 'unknown' });
    }
  }
);

const port = process.env.PORT ? Number(process.env.PORT) : 3000;

if (require.main === module) {
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`API proxy listening on http://localhost:${port}`);
  });
}

export default app;
