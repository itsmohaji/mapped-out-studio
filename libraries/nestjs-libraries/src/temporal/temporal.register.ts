import { Global, Injectable, Logger, Module, OnModuleInit } from '@nestjs/common';
import { TemporalService } from 'nestjs-temporal-core';
import { Connection } from '@temporalio/client';

/**
 * Nest runs OnModuleInit hooks inside app.init(), AFTER routes are registered
 * but BEFORE the socket is bound. So anything that hangs in here stops the API
 * from ever listening — the process stays alive with every route mapped and
 * nothing on :3000, and nginx returns 502 for every request.
 *
 * These are gRPC calls to Temporal with no deadline, and listSearchAttributes
 * reads Temporal's visibility store (Elasticsearch). When that is unhealthy the
 * call never returns and it takes the whole API down with it. Registering a
 * search attribute is startup housekeeping — it must never be able to do that.
 */
const STARTUP_TIMEOUT_MS = 15000;

export async function withTimeout<T>(what: string, p: Promise<T>): Promise<T | null> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      Logger.warn(
        `${what} did not respond within ${STARTUP_TIMEOUT_MS}ms — continuing startup without it`,
        'TemporalRegister'
      );
      resolve(null);
    }, STARTUP_TIMEOUT_MS);
  });
  try {
    return await Promise.race([p, timeout]);
  } catch (e) {
    Logger.warn(`${what} failed: ${e} — continuing startup`, 'TemporalRegister');
    return null;
  } finally {
    clearTimeout(timer!);
  }
}

@Injectable()
export class TemporalRegister implements OnModuleInit {
  constructor(private _client: TemporalService) {}

  async onModuleInit(): Promise<void> {
    if (process.env.TEMPORAL_TLS === 'true') {
      return;
    }
    const connection = this._client?.client?.getRawClient()
      ?.connection as Connection;

    const listed = await withTimeout(
      'Temporal listSearchAttributes',
      connection.operatorService.listSearchAttributes({
        namespace: process.env.TEMPORAL_NAMESPACE || 'default',
      })
    );
    // Could not read them — do not guess at what is missing, just carry on and
    // let the API serve. The workflow code re-registers on next boot.
    if (!listed) return;
    const { customAttributes } = listed;

    const neededAttribute = ['organizationId', 'postId'];
    const missingAttributes = neededAttribute.filter(
      (attr) => !customAttributes[attr]
    );

    if (missingAttributes.length > 0) {
      await withTimeout(
        'Temporal addSearchAttributes',
        connection.operatorService.addSearchAttributes({
          namespace: process.env.TEMPORAL_NAMESPACE || 'default',
          searchAttributes: missingAttributes.reduce((all, current) => {
            // @ts-ignore
            all[current] = 1;
            return all;
          }, {}),
        })
      );
    }
  }
}

@Global()
@Module({
  imports: [],
  controllers: [],
  providers: [TemporalRegister],
  get exports() {
    return this.providers;
  },
})
export class TemporalRegisterMissingSearchAttributesModule {}
