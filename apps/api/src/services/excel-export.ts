import ExcelJS from 'exceljs';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { PaperTrade, PaperTradeStats } from '../types.js';

/** Escribe/actualiza el historial paper trading en .xlsx */
export async function writePaperTradesExcel(
  filePath: string,
  trades: PaperTrade[],
  stats: PaperTradeStats,
): Promise<string> {
  mkdirSync(dirname(filePath), { recursive: true });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'oddjusta-live-monitor';
  workbook.created = new Date();

  const historial = workbook.addWorksheet('Historial');
  historial.columns = [
    { header: 'id', key: 'id', width: 28 },
    { header: 'eventId', key: 'eventId', width: 12 },
    { header: 'partido', key: 'matchLabel', width: 28 },
    { header: 'lado_entrada', key: 'side', width: 12 },
    { header: 'seleccion', key: 'selection', width: 10 },
    { header: 'lado_salida', key: 'exitSide', width: 12 },
    { header: 'estado', key: 'status', width: 10 },
    { header: 'responsabilidad_usd', key: 'liabilityUsd', width: 18 },
    { header: 'cuota_lay_entrada', key: 'entryOdds', width: 16 },
    { header: 'minuto_entrada', key: 'entryMinute', width: 14 },
    { header: 'marcador_entrada', key: 'entryScore', width: 16 },
    { header: 'entrada_at', key: 'entryAt', width: 24 },
    { header: 'cuota_back_salida', key: 'exitOdds', width: 16 },
    { header: 'minuto_salida', key: 'exitMinute', width: 14 },
    { header: 'marcador_salida', key: 'exitScore', width: 16 },
    { header: 'salida_at', key: 'exitAt', width: 24 },
    { header: 'motivo_salida', key: 'exitReason', width: 18 },
    { header: 'pnl_usd', key: 'pnlUsd', width: 12 },
    { header: 'exito', key: 'success', width: 10 },
    { header: 'notas', key: 'notes', width: 50 },
  ];

  for (const t of trades) {
    historial.addRow({
      ...t,
      success: t.success === undefined ? '' : t.success ? 'si' : 'no',
    });
  }
  historial.getRow(1).font = { bold: true };

  const resumen = workbook.addWorksheet('Resumen');
  resumen.columns = [
    { header: 'metrica', key: 'metrica', width: 28 },
    { header: 'valor', key: 'valor', width: 18 },
  ];
  resumen.getRow(1).font = { bold: true };
  resumen.addRows([
    { metrica: 'ops_abiertas', valor: stats.openCount },
    { metrica: 'ops_cerradas', valor: stats.closedCount },
    { metrica: 'exitos', valor: stats.successCount },
    { metrica: 'no_exitos', valor: stats.failCount },
    { metrica: 'pct_exito', valor: stats.successPct },
    { metrica: 'pct_no_exito', valor: stats.failPct },
    { metrica: 'pnl_total_usd', valor: stats.totalPnlUsd },
    {
      metrica: 'aviso',
      valor: 'Paper trading simulado — no es dinero real ni órdenes Odd Justa',
    },
  ]);

  const leyenda = workbook.addWorksheet('Leyenda');
  leyenda.columns = [
    { header: 'campo', key: 'campo', width: 22 },
    { header: 'significado', key: 'significado', width: 70 },
  ];
  leyenda.getRow(1).font = { bold: true };
  leyenda.addRows([
    {
      campo: 'responsabilidad_usd',
      significado:
        'Liability del Lay. Convención: min($5, 1% bankroll). Bankroll default $500 → $5.',
    },
    {
      campo: 'cierre',
      significado:
        'Siempre Back Draw para cerrar el Lay Draw (hedge). Motivo: first_goal_close | hard_close | manual_close.',
    },
    {
      campo: 'pnl_usd',
      significado:
        'P&L = Q*(B-L)/((L-1)*(B-1)) con Q=liability, L=cuota lay entrada, B=cuota back salida. NO es ±Q completo.',
    },
    {
      campo: 'exito',
      significado: 'si si pnl_usd > 0 (típicamente B>L); no si pnl_usd ≤ 0 (B≤L). Red ≠ -100% entrada.',
    },
    {
      campo: 'pct_exito / pct_no_exito',
      significado: '% sobre operaciones cerradas',
    },
  ]);

  await workbook.xlsx.writeFile(filePath);
  return filePath;
}
