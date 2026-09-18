type TimedReply = { created_at: string; replied_at: string | null };

export function responseSla(rows: TimedReply[]) {
  const hours = rows.flatMap((row) => {
    if (!row.replied_at) return [];
    const elapsed = (new Date(row.replied_at).getTime() - new Date(row.created_at).getTime()) / 3_600_000;
    return Number.isFinite(elapsed) && elapsed >= 0 ? [elapsed] : [];
  });
  const within24h = hours.filter((value) => value <= 24).length;
  return {
    averageResponseHours: hours.length
      ? Math.round((hours.reduce((sum, value) => sum + value, 0) / hours.length) * 10) / 10
      : null,
    repliedWithin24hRate: hours.length ? Math.round((within24h / hours.length) * 1000) / 10 : 0,
  };
}
