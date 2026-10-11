// Pings the API's health check on a cron so the free Render service never sleeps and its
// @nestjs/schedule sweeps keep running. The health check also queries the database.
export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(ping(env.API_HEALTH_URL));
  },
};

async function ping(url) {
  // A sleeping service takes about a minute to wake up.
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  // A thrown error marks the cron run as failed in the Workers dashboard.
  if (!res.ok) throw new Error(`health check answered ${res.status}`);
}
