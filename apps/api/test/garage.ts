import { readFileSync } from 'node:fs';
import path from 'node:path';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';

/** Same image as infrastructure/compose (ADR-215). */
export const GARAGE_IMAGE = 'dxflrs/garage:v2.4.1';
export const TEST_S3 = {
  bucket: 'fi-documents',
  accessKeyId: 'GK1f2e3d4c5b6a79880f1e2d3c',
  secretAccessKey: '6d1c4f0a9b8e7d6c5b4a39281706f5e4d3c2b1a0f9e8d7c6b5a4938271605f4e',
};

async function garage(container: StartedTestContainer, ...args: string[]): Promise<string> {
  const result = await container.exec(['/garage', ...args]);
  if (result.exitCode !== 0) throw new Error(`garage ${args.join(' ')} failed: ${result.output}`);
  return result.output.trim();
}

/** A single-node Garage with the documents bucket and the API key, like infrastructure/garage/init-dev.sh. */
export async function startGarage(): Promise<{ container: StartedTestContainer; endpoint: string }> {
  const config = readFileSync(
    path.resolve(__dirname, '../../../infrastructure/garage/garage.dev.toml'),
    'utf8',
  );
  const container = await new GenericContainer(GARAGE_IMAGE)
    .withCopyContentToContainer([{ content: config, target: '/etc/garage.toml' }])
    .withExposedPorts(3900)
    .withWaitStrategy(Wait.forLogMessage(/S3 API server listening/))
    .start();

  const nodeId = (await garage(container, 'node', 'id', '-q')).split('@')[0]!;
  await garage(container, 'layout', 'assign', '-z', 'dc1', '-c', '1G', nodeId);
  await garage(container, 'layout', 'apply', '--version', '1');
  await garage(
    container,
    'key',
    'import',
    '--yes',
    '-n',
    'fi-api',
    TEST_S3.accessKeyId,
    TEST_S3.secretAccessKey,
  );
  await garage(container, 'bucket', 'create', TEST_S3.bucket);
  await garage(
    container,
    'bucket',
    'allow',
    '--read',
    '--write',
    '--owner',
    TEST_S3.bucket,
    '--key',
    TEST_S3.accessKeyId,
  );

  return { container, endpoint: `http://${container.getHost()}:${container.getMappedPort(3900)}` };
}
