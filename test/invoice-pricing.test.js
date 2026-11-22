'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const pricing = require('../lib/pricing');
const invoice = require('../lib/invoice');

function sampleOrder(item, coupon) {
  const totals = pricing.computeTotals([item], coupon || '');
  return {
    id: 1,
    date: '2026-11-22',
    customer: 'In-memory customer',
    paymentMode: 'cash',
    status: 'completed',
    coupon: coupon || '',
    items: [item],
    subtotal: totals.subtotal,
    discount: totals.discount,
    tax: totals.tax,
    total: totals.total
  };
}

function assertInvoiceMatchesBilled(order) {
  const billed = pricing.computeTotals(order.items, order.coupon);
  const invoiced = invoice.computeInvoiceFigures(order);

  assert.deepEqual(
    {
      subtotal: invoiced.subtotal,
      discount: invoiced.discount,
      tax: invoiced.tax,
      cgst: invoiced.cgst,
      sgst: invoiced.sgst,
      total: invoiced.total
    },
    {
      subtotal: billed.subtotal,
      discount: billed.discount,
      tax: billed.tax,
      cgst: billed.cgst,
      sgst: billed.sgst,
      total: billed.total
    }
  );
  assert.deepEqual(
    invoiced.rows.map(row => ({ gstPercent: row.gstPercent, line: row.line, lineTax: row.lineTax })),
    billed.lines.map(line => ({ gstPercent: line.gstPercent, line: line.gross, lineTax: line.tax }))
  );
}

test('invoice uses the billed HSN slab and GST breakdown', () => {
  const order = sampleOrder({ id: 1, name: 'Rice', sku: 'RICE-1', hsn: '1006', price: 100, qty: 1 });
  const invoiced = invoice.computeInvoiceFigures(order);

  assert.deepEqual(
    { tax: invoiced.tax, cgst: invoiced.cgst, sgst: invoiced.sgst, total: invoiced.total, gstPercent: invoiced.rows[0].gstPercent },
    { tax: 5, cgst: 2.5, sgst: 2.5, total: 105, gstPercent: 5 }
  );
  assertInvoiceMatchesBilled(order);
});

test('invoice applies the same coupon discount and post-discount GST as billing', () => {
  const order = sampleOrder({ id: 2, name: 'Coffee', sku: 'COF-1', hsn: '0902', price: 600, qty: 1 }, 'SAVE10');
  const invoiced = invoice.computeInvoiceFigures(order);

  assert.deepEqual(
    { discount: invoiced.discount, tax: invoiced.tax, total: invoiced.total },
    { discount: 60, tax: 97.2, total: 637.2 }
  );
  assertInvoiceMatchesBilled(order);
});

test('invoice respects the coupon maximum discount and matches the billed total', () => {
  const order = sampleOrder({ id: 3, name: 'Coffee', sku: 'COF-1', hsn: '0902', price: 4000, qty: 1 }, 'WHOLESALE15');
  const invoiced = invoice.computeInvoiceFigures(order);
  const html = invoice.render(order);

  assert.deepEqual(
    { discount: invoiced.discount, tax: invoiced.tax, total: invoiced.total },
    { discount: 400, tax: 648, total: 4248 }
  );
  assert.doesNotMatch(html, /Accountant Reconciliation Notice/);
  assertInvoiceMatchesBilled(order);
});
