/**
 * labels.js — Label HTML generation.
 * Ported from printly-main/src/main/printer.ts — buildLabelHtml()
 */

const LABEL_DIMENSIONS = {
  '1x3':        { width: 76200,  height: 25400  },
  '2x3':        { width: 76200,  height: 50800  },
  '4x6':        { width: 152400, height: 101600 },
  '2x1':        { width: 25400,  height: 50800  },
  '2.25x1.25':  { width: 57150,  height: 31750  },
  'thermal-58': { width: 58000,  height: 120000 },
  '1.125x3.5':  { width: 28575,  height: 88900  },
  '1x2.125':    { width: 25400,  height: 53975  },
  '1.25x2.25':  { width: 31750,  height: 57150  },
}

function buildLabelHtml(data) {
  const { labelSize } = data
  const isSmall   = labelSize === '1x3' || labelSize === '2x1'
  const isLarge   = labelSize === '4x6'
  const isJewelry = labelSize === '2.25x1.25'
  const isThermal = labelSize === 'thermal-58'
  const isDymoPortrait = ['1.125x3.5', '1x2.125', '1.25x2.25'].includes(labelSize)

  // ── THERMAL RECEIPT (58mm roll) ──────────────────────────────────────────────
  if (isThermal) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
      *{margin:0;padding:0;box-sizing:border-box;}
      @page{size:58mm 120mm;margin:15mm 4mm 20mm 4mm;}
      body{font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;background:#fff;color:#000;width:58mm;}
      .receipt{width:100%;display:flex;flex-direction:column;align-items:center;text-align:center;}
      .divider{width:100%;border:none;border-top:1.5px solid #000;margin:5px 0;}
      .order-label{font-size:9px;font-weight:900;letter-spacing:.18em;text-transform:uppercase;margin-top:4px;margin-bottom:1px;}
      .order-number{font-size:44px;font-weight:900;line-height:1;letter-spacing:-.02em;margin-bottom:4px;}
      .buyer{font-size:18px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;margin:5px 0 2px;}
      .item{font-size:13px;font-weight:400;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;margin-bottom:3px;}
      .price{font-size:18px;font-weight:700;margin:3px 0;}
      .meta{font-size:10px;color:#555;margin:2px 0;}
      .seller{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin:4px 0 2px;}
    </style></head><body>
    <div class="receipt">
      <hr class="divider">
      <div class="order-label">Order</div>
      <div class="order-number">${String(data.orderNumber).padStart(3,'0')}</div>
      <hr class="divider">
      <div class="buyer">@${data.buyerName}</div>
      ${data.itemName ? `<div class="item">${data.itemName}</div>` : ''}
      ${data.showPrice && data.price ? `<div class="price">$${Number(data.price).toFixed(2)}</div>` : ''}
      ${data.showTimestamp ? `<div class="meta">${data.timestamp}</div>` : ''}
      <hr class="divider">
      ${data.sellerName ? `<div class="seller">${data.sellerName}</div>` : ''}
    </div></body></html>`
  }

  // ── DYMO PORTRAIT ────────────────────────────────────────────────────────────
  if (isDymoPortrait) {
    const dims = LABEL_DIMENSIONS[labelSize]
    const wIn = (dims.width  / 25400).toFixed(4) + 'in'
    const hIn = (dims.height / 25400).toFixed(4) + 'in'
    const orderSize = labelSize === '1.125x3.5' ? '48px' : '38px'
    const buyerSize = labelSize === '1.125x3.5' ? '14px' : '12px'
    const itemSize  = labelSize === '1.125x3.5' ? '11px' : '10px'
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
      *{margin:0;padding:0;box-sizing:border-box;}
      @page{size:${wIn} ${hIn};margin:0;}
      html,body{width:${wIn};height:${hIn};max-width:${wIn};max-height:${hIn};overflow:hidden;font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;background:#fff;color:#000;}
      .label{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:5px 4px;gap:4px;border:1px solid #ccc;}
      .order-label{font-size:8px;font-weight:900;letter-spacing:.15em;text-transform:uppercase;}
      .order-number{font-size:${orderSize};font-weight:900;line-height:1;letter-spacing:-.02em;color:${data.accentColor||'#000'};}
      .divider{width:70%;border:none;border-top:1px solid #ccc;}
      .buyer{font-size:${buyerSize};font-weight:800;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;}
      .item{font-size:${itemSize};font-weight:400;color:#333;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;}
      .meta{font-size:9px;color:#666;text-align:center;}
    </style></head><body>
    <div class="label">
      <div class="order-label">Order</div>
      <div class="order-number">${String(data.orderNumber).padStart(3,'0')}</div>
      <hr class="divider">
      <div class="buyer">@${data.buyerName}</div>
      ${data.itemName ? `<div class="item">${data.itemName}</div>` : ''}
      ${(data.showPrice && data.price) || data.showTimestamp ? `<div class="meta">${[data.showPrice && data.price ? `$${Number(data.price).toFixed(2)}` : '', data.showTimestamp ? data.timestamp : ''].filter(Boolean).join(' · ')}</div>` : ''}
    </div></body></html>`
  }

  // ── JEWELRY (2.25x1.25 landscape) ───────────────────────────────────────────
  if (isJewelry) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
      *{margin:0;padding:0;box-sizing:border-box;}
      @page{size:2.25in 1.25in;margin:3mm 4mm;}
      body{font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;background:#fff;color:#000;height:100vh;}
      .label{width:100%;height:100%;display:flex;flex-direction:row;align-items:stretch;}
      .left{width:36%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding-right:6px;flex-shrink:0;}
      .order-label{font-size:7px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;margin-bottom:2px;}
      .order-number{font-size:30px;font-weight:900;line-height:1;}
      .divider{width:1.5px;background:${data.accentColor||'#000'};flex-shrink:0;}
      .right{flex:1;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;padding-left:8px;gap:3px;min-width:0;}
      .buyer{font-size:13px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;line-height:1.2;}
      .item{font-size:11px;font-weight:500;color:#222;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;line-height:1.2;}
      .meta{font-size:11px;font-weight:700;color:#333;line-height:1.2;}
    </style></head><body>
    <div class="label">
      <div class="left">
        <div class="order-label">Order</div>
        <div class="order-number">${String(data.orderNumber).padStart(3,'0')}</div>
      </div>
      <div class="divider"></div>
      <div class="right">
        <div class="buyer">@${data.buyerName}</div>
        ${data.itemName ? `<div class="item">${data.itemName}</div>` : ''}
        ${(data.showPrice && data.price) || data.showTimestamp ? `<div class="meta">${[data.showPrice && data.price ? `$${Number(data.price).toFixed(2)}` : '', data.showTimestamp ? data.timestamp : ''].filter(Boolean).join('  ')}</div>` : ''}
      </div>
    </div></body></html>`
  }

  // ── STANDARD LABELS ──────────────────────────────────────────────────────────
  const is1x3 = labelSize === '1x3'
  const orderFontSize = isLarge ? '72px' : is1x3 ? '24px' : isSmall ? '28px' : '44px'
  const nameFontSize  = isLarge ? '36px' : isSmall ? '14px' : '22px'
  const itemFontSize  = isLarge ? '28px' : isSmall ? '11px' : '17px'
  const metaFontSize  = isLarge ? '22px' : isSmall ? '9px'  : '13px'
  const padding       = isLarge ? '12px 16px' : is1x3 ? '7px 8px' : isSmall ? '3px 6px' : '6px 10px'

  const widths  = {'1x3':'3in','2x3':'3in','4x6':'6in','2x1':'1in','2.25x1.25':'2.25in','1.125x3.5':'1.125in','1x2.125':'1in','1.25x2.25':'1.25in','thermal-58':'58mm'}
  const heights = {'1x3':'1in','2x3':'2in','4x6':'4in','2x1':'2in','2.25x1.25':'1.25in','1.125x3.5':'3.5in','1x2.125':'2.125in','1.25x2.25':'2.25in','thermal-58':'120mm'}

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    *{margin:0;padding:0;box-sizing:border-box;}
    @page{size:${widths[labelSize]} ${heights[labelSize]};margin:0;}
    body{width:${widths[labelSize]};height:${heights[labelSize]};overflow:hidden;font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;background:#fff;color:#000;}
    .label{width:100%;height:100%;display:flex;flex-direction:row;align-items:center;padding:${padding};gap:8px;border:1px solid #ccc;}
    .order-block{display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:fit-content;padding-right:8px;border-right:2px solid ${data.accentColor||'#000'};}
    .order-label{font-size:${metaFontSize};font-weight:900;letter-spacing:.08em;text-transform:uppercase;}
    .order-number{font-size:${orderFontSize};font-weight:900;line-height:1;letter-spacing:-.02em;}
    .info-block{flex:1;overflow:hidden;display:flex;flex-direction:column;gap:1px;}
    .buyer{font-size:${nameFontSize};font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .item{font-size:${itemFontSize};font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#222;}
    .meta{font-size:${metaFontSize};color:#666;display:flex;gap:6px;}
  </style></head><body>
  <div class="label">
    <div class="order-block">
      <div class="order-label">Order</div>
      <div class="order-number">${String(data.orderNumber).padStart(3,'0')}</div>
    </div>
    <div class="info-block">
      <div class="buyer">@${data.buyerName}</div>
      ${data.itemName ? `<div class="item">${data.itemName}</div>` : ''}
      <div class="meta">
        ${data.showPrice && data.price ? `<span>$${Number(data.price).toFixed(2)}</span>` : ''}
        ${data.showTimestamp ? `<span>${data.timestamp}</span>` : ''}
      </div>
    </div>
  </div></body></html>`
}

module.exports = { buildLabelHtml, LABEL_DIMENSIONS }
