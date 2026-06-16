import { formatCurrency, monthKey, expensesForMonth, groupByCategory, sumAmounts, pct } from "./utils.js";

export function exportSpendWiseWorkbook(data) {
  const workbook = buildWorkbook(data);
  const bytes = createXlsx(workbook);
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `spendwise-export-${new Date().toISOString().split("T")[0]}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

function buildWorkbook(data) {
  const expenses = (data.expenses || []).map(normalizeExpense).sort((a, b) => b.date - a.date);
  const savings = data.savingsGoals || [];
  const budgets = data.budgets || [];
  const currentBudget = effectiveBudget(budgets, monthKey()) || {};
  const thisMonth = expensesForMonth(expenses, monthKey());
  const thisYear = expenses.filter(e => e.date.getFullYear() === new Date().getFullYear());
  const byCategory = Object.entries(groupByCategory(expenses)).sort(([, a], [, b]) => b - a);
  const byMethod = groupBy(expenses, "paymentMethod");
  const totalExpenses = sumAmounts(expenses);
  const totalSavings = savings.reduce((s, g) => s + Number(g.currentAmount || 0), 0);
  const healthScore = budgetHealthScore(thisMonth, currentBudget, savings);

  const summary = [
    ["SpendWise Export", "", "", ""],
    ["Generated", new Date().toLocaleString("en-PH"), "", ""],
    ["", "", "", ""],
    ["Dashboard Summary", "", "", ""],
    ["Total Expenses", totalExpenses, "", ""],
    ["Total Savings", totalSavings, "", ""],
    ["Budget Health Score", healthScore, "", ""],
    ["Current Month Expenses", sumAmounts(thisMonth), "", ""],
    ["Current Year Expenses", sumAmounts(thisYear), "", ""],
    ["", "", "", ""],
    ["Top Categories", "Amount", "Share", "Chart"],
    ...byCategory.slice(0, 8).map(([name, amount]) => [name, amount, totalExpenses ? amount / totalExpenses : 0, amount]),
    ["", "", "", ""],
    ["Top Payment Methods", "Amount", "Transactions", ""],
    ...byMethod.slice(0, 8).map(([name, value]) => [name, value.total, value.count, ""]),
  ];

  const expenseRows = [
    ["Date", "Amount", "Category", "Payment Method", "Note"],
    ...expenses.map(e => [e.date, Number(e.amount || 0), e.category || "", e.paymentMethod || "", e.note || ""]),
  ];

  const spentByCat = groupByCategory(thisMonth);
  const budgetRows = [
    ["Category", "Budget", "Spent", "Remaining"],
    ["Overall", Number(currentBudget.total || 0), sumAmounts(thisMonth), Number(currentBudget.total || 0) - sumAmounts(thisMonth)],
    ...Object.entries(currentBudget.categories || {}).map(([cat, amount]) => [
      cat,
      Number(amount || 0),
      Number(spentByCat[cat] || 0),
      Number(amount || 0) - Number(spentByCat[cat] || 0),
    ]),
  ];

  const savingsRows = [
    ["Goal", "Target", "Current", "Progress %", "Forecast Completion"],
    ...savings.map(g => [
      g.name || "",
      Number(g.targetAmount || 0),
      Number(g.currentAmount || 0),
      pct(Number(g.currentAmount || 0), Number(g.targetAmount || 0)) / 100,
      forecastSavings(g, data.savingsContributions || []),
    ]),
  ];

  return [
    sheet("Dashboard Summary", summary, [26, 18, 14, 28], { freeze: 11, currencyCols: [2], percentCols: [3], dataBar: "D12:D19" }),
    sheet("Expenses", expenseRows, [16, 15, 20, 20, 36], { freeze: 1, currencyCols: [2], dateCols: [1], autoFilter: true }),
    sheet("Budgets", budgetRows, [24, 16, 16, 16], { freeze: 1, currencyCols: [2, 3, 4], autoFilter: true }),
    sheet("Savings Goals", savingsRows, [26, 16, 16, 14, 24], { freeze: 1, currencyCols: [2, 3], percentCols: [4], autoFilter: true }),
  ];
}

function sheet(name, rows, widths, options = {}) {
  return { name, rows, widths, options };
}

function normalizeExpense(e) {
  return {
    ...e,
    date: toDate(e.date),
    amount: Number(e.amount || 0),
  };
}

function effectiveBudget(budgets, key) {
  const eligible = budgets.filter(b => b.id <= key).sort((a, b) => a.id.localeCompare(b.id));
  return eligible[eligible.length - 1] || null;
}

function groupBy(expenses, prop) {
  const map = {};
  expenses.forEach(e => {
    const key = e[prop] || "Unknown";
    if (!map[key]) map[key] = { total: 0, count: 0 };
    map[key].total += Number(e.amount || 0);
    map[key].count += 1;
  });
  return Object.entries(map).sort(([, a], [, b]) => b.total - a.total);
}

function budgetHealthScore(expenses, budget, goals) {
  const total = Number(budget.total || 0);
  const spent = sumAmounts(expenses);
  const goalProgress = goals.length
    ? goals.reduce((s, g) => s + pct(Number(g.currentAmount || 0), Number(g.targetAmount || 0)), 0) / goals.length
    : 70;
  const adherence = total > 0 ? Math.max(0, 100 - Math.max(0, (spent / total - 1) * 120)) : 70;
  return Math.round(adherence * .6 + goalProgress * .4);
}

function forecastSavings(goal, contributions) {
  const remaining = Math.max(0, Number(goal.targetAmount || 0) - Number(goal.currentAmount || 0));
  if (!remaining) return "Complete";
  const items = contributions
    .filter(c => c.goalId === goal.id && Number(c.amount || 0) > 0)
    .sort((a, b) => toDate(a.date) - toDate(b.date));
  if (!items.length) return "Needs contribution history";
  const months = Math.max(1, monthDiff(toDate(items[0].date), toDate(items[items.length - 1].date)) + 1);
  const monthly = items.reduce((s, c) => s + Number(c.amount || 0), 0) / months;
  const estimated = new Date();
  estimated.setMonth(estimated.getMonth() + Math.ceil(remaining / monthly));
  return estimated.toLocaleDateString("en-PH", { month: "long", year: "numeric" });
}

function monthDiff(a, b) {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

function toDate(value) {
  return value?.toDate ? value.toDate() : new Date(value);
}

function createXlsx(sheets) {
  const files = {};
  files["[Content_Types].xml"] = contentTypes(sheets.length);
  files["_rels/.rels"] = packageRels();
  files["xl/workbook.xml"] = workbookXml(sheets);
  files["xl/_rels/workbook.xml.rels"] = workbookRels(sheets.length);
  files["xl/styles.xml"] = stylesXml();
  sheets.forEach((s, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = worksheetXml(s);
  });
  return zip(files);
}

function contentTypes(count) {
  const sheets = Array.from({ length: count }, (_, i) =>
    `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets}</Types>`;
}

function packageRels() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
}

function workbookXml(sheets) {
  const sheetDefs = sheets.map((s, i) =>
    `<sheet name="${escAttr(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheetDefs}</sheets></workbook>`;
}

function workbookRels(count) {
  const rels = Array.from({ length: count }, (_, i) =>
    `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${rels}<Relationship Id="rId${count + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="₱#,##0.00"/><numFmt numFmtId="165" formatCode="0%"/><numFmt numFmtId="166" formatCode="mmm d, yyyy"/></numFmts>
<fonts count="3"><font><sz val="11"/><color rgb="FF111827"/><name val="Segoe UI"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Segoe UI"/></font><font><b/><sz val="16"/><color rgb="FF4F46E5"/><name val="Segoe UI"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF4F46E5"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEFF6FF"/></patternFill></fill></fills>
<borders count="2"><border/><border><left style="thin"><color rgb="FFE5E7EB"/></left><right style="thin"><color rgb="FFE5E7EB"/></right><top style="thin"><color rgb="FFE5E7EB"/></top><bottom style="thin"><color rgb="FFE5E7EB"/></bottom></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"/><xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function worksheetXml(sheet) {
  const cols = sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
  const rows = sheet.rows.map((row, r) => rowXml(row, r + 1, sheet.options)).join("");
  const freeze = sheet.options.freeze ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sheet.options.freeze}" topLeftCell="A${sheet.options.freeze + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : "";
  const autoFilter = sheet.options.autoFilter ? `<autoFilter ref="A1:${colName(sheet.rows[0].length)}${sheet.rows.length}"/>` : "";
  const dataBar = sheet.options.dataBar ? `<conditionalFormatting sqref="${sheet.options.dataBar}"><cfRule type="dataBar" priority="1"><dataBar><cfvo type="min"/><cfvo type="max"/><color rgb="FF4F46E5"/></dataBar></cfRule></conditionalFormatting>` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
${freeze}<cols>${cols}</cols><sheetData>${rows}</sheetData>${autoFilter}${dataBar}
</worksheet>`;
}

function rowXml(row, rowNumber, options) {
  const cells = row.map((value, i) => cellXml(value, rowNumber, i + 1, styleFor(value, rowNumber, i + 1, options))).join("");
  return `<row r="${rowNumber}">${cells}</row>`;
}

function styleFor(value, row, col, options) {
  if (row === 1 && typeof value === "string" && value.includes("SpendWise")) return 5;
  if (row === 1 || row === 4 || row === 11 || row === 22) return 1;
  if (options.dateCols?.includes(col)) return 4;
  if (options.currencyCols?.includes(col)) return 2;
  if (options.percentCols?.includes(col)) return 3;
  return 0;
}

function cellXml(value, row, col, style) {
  const ref = `${colName(col)}${row}`;
  if (value instanceof Date) {
    return `<c r="${ref}" s="${style}"><v>${excelDate(value)}</v></c>`;
  }
  if (typeof value === "number" && isFinite(value)) {
    return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
  }
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t>${escXml(value ?? "")}</t></is></c>`;
}

function excelDate(date) {
  return Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(1899, 11, 30)) / 86400000);
}

function colName(n) {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - m) / 26);
  }
  return s;
}

function escXml(value) {
  return String(value).replace(/[<>&'"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
}

function escAttr(value) {
  return escXml(value).slice(0, 31);
}

function zip(files) {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  Object.entries(files).forEach(([name, content]) => {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);
    const crc = crc32(data);
    const local = concat(
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0),
      nameBytes, data
    );
    chunks.push(local);
    central.push(concat(
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset), nameBytes
    ));
    offset += local.length;
  });
  const centralStart = offset;
  const centralBytes = concat(...central);
  const end = concat(
    u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length),
    u32(centralBytes.length), u32(centralStart), u16(0)
  );
  return concat(...chunks, centralBytes, end);
}

function concat(...arrays) {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  arrays.forEach(a => { out.set(a, offset); offset += a.length; });
  return out;
}

function u16(n) {
  return new Uint8Array([n & 255, (n >>> 8) & 255]);
}

function u32(n) {
  return new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]);
}

let crcTable;
function crc32(data) {
  crcTable ||= Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
