// Fast drop-in for csv-reader 1.0.0 (make.fun). Same answers as the reference.
//
// Per record, fields are taken segment by segment: a segment is the rest
// of the current line (up to the next LF). A segment with no quote and no
// stray CR is taken with one split(',') (native). Other segments are
// parsed field by field, one indexOf(',') per unquoted field, one
// indexOf('"') scan per quoted field. Only a quoted field that spans a
// line break (or never closes) is handled by the global reader, once,
// after which segment parsing resumes on the line where it ends. Field
// values are slices (SlicedString, no copy), never built char by char,
// except the genuinely broken pieces (stray CR, "" escapes, embedded
// breaks, quote junk), which take a slow path.

const COMMA = 0, LINE = 1, END = 2;

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = 0;
  let line = 1;
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // Slow unquoted read from `start` in the whole text, value starting as
  // `prefix`. Rare (stray CR). Returns [value, ended, added]; advances
  // pos/line; pushes stray_cr errors as met.
  const slowUnquoted = (start, prefix, recLine, recRow) => {
    let value = prefix;
    let added = 0;
    let p = start;
    while (p < n) {
      const c = text.charCodeAt(p);
      if (c === 44) { pos = p + 1; return [value, COMMA, added]; }
      if (c === 10) { pos = p + 1; line += 1; return [value, LINE, added]; }
      if (c === 13) {
        if (text.charCodeAt(p + 1) === 10) { pos = p + 2; line += 1; return [value, LINE, added]; }
        errors.push({ code: 'stray_cr', line: recLine, row: recRow });
        p += 1;
        continue;
      }
      value += text[p];
      added += 1;
      p += 1;
    }
    pos = n;
    return [value, END, added];
  };

  // Fast unquoted read from `start` in the whole text, value starting as
  // `prefix`. Returns [value, ended, added]; advances pos/line.
  const fastUnquoted = (start, prefix, recLine, recRow) => {
    const ci = text.indexOf(',', start);
    const li = text.indexOf('\n', start);
    let end, ended;
    if (ci === -1 && li === -1) { end = n; ended = END; }
    else if (ci !== -1 && (li === -1 || ci < li)) { end = ci; ended = COMMA; }
    else { end = li; ended = LINE; }
    let fe = end;
    if (ended === LINE && fe > start && text.charCodeAt(fe - 1) === 13) fe -= 1;
    const f = text.slice(start, fe);
    if (f.indexOf('\r') !== -1) return slowUnquoted(start, prefix, recLine, recRow);
    pos = ended === END ? n : end + 1;
    if (ended === LINE) line += 1;
    return [prefix === '' ? f : prefix + f, ended, f.length];
  };

  // A quoted field whose opening quote is at `open` in the whole text
  // (it may span line breaks, or never close). Returns [value, ended];
  // advances pos/line; pushes unterminated_quote / quote_junk / stray_cr.
  const readQuotedGlobal = (open, recLine, recRow) => {
    const start = open + 1;
    let q = text.indexOf('"', start);
    let escaped = false;
    while (q !== -1 && text.charCodeAt(q + 1) === 34) { escaped = true; q = text.indexOf('"', q + 2); }
    if (q === -1) {
      errors.push({ code: 'unterminated_quote', line: recLine, row: recRow });
      return fastUnquoted(open + 1, '"', recLine, recRow);
    }
    let value;
    const raw = text.slice(start, q);
    const hasNL = raw.indexOf('\n') !== -1;
    const hasCR = raw.indexOf('\r') !== -1;
    if (!escaped && !hasNL && !hasCR) value = raw;
    else {
      let v = escaped ? raw.replaceAll('""', '"') : raw;
      if (hasCR) v = v.replace(/\r\n?/g, '\n');
      let cnt = 0, idx = -1;
      while ((idx = v.indexOf('\n', idx + 1)) !== -1) cnt += 1;
      line += cnt;
      value = v;
    }
    pos = q + 1;
    if (pos >= n) return [value, END, 0];
    const c = text.charCodeAt(pos);
    if (c === 44) { pos += 1; return [value, COMMA, 0]; }
    if (c === 10) { pos += 1; line += 1; return [value, LINE, 0]; }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) { pos += 2; line += 1; return [value, LINE, 0]; }
    const r = fastUnquoted(pos, value, recLine, recRow);
    if (r[2] > 0) errors.push({ code: 'quote_junk', line: recLine, row: recRow });
    return r;
  };

  while (true) {
    // Skip lines with no characters (LF or CRLF).
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) { pos += 1; line += 1; }
      else if (c === 13 && text.charCodeAt(pos + 1) === 10) { pos += 2; line += 1; }
      else break;
    }
    if (pos >= n) break;

    const recordLine = line;
    const recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let lastQuoted = false;

    // Parse this record, segment by segment, until it ends.
    let ended = COMMA;
    while (ended === COMMA) {
      const lf = text.indexOf('\n', pos);
      const lineEnd = lf === -1 ? n : lf;
      let segEnd = lineEnd;
      if (lf !== -1 && segEnd > pos && text.charCodeAt(segEnd - 1) === 13) segEnd -= 1;
      const trailingCrAtEof = lf === -1 && segEnd > pos && text.charCodeAt(segEnd - 1) === 13;

      if (trailingCrAtEof) {
        // Last line, ending in a stray CR: global field parse to the end.
        do {
          if (text.charCodeAt(pos) === 34) {
            lastQuoted = true;
            const r = readQuotedGlobal(pos, recordLine, recordRow);
            fields.push(r[0]);
            ended = r[1];
          } else {
            lastQuoted = false;
            const r = fastUnquoted(pos, '', recordLine, recordRow);
            fields.push(r[0]);
            ended = r[1];
          }
        } while (ended === COMMA);
        break;
      }

      const seg = text.slice(pos, segEnd);
      const segHasCR = seg.indexOf('\r') !== -1;
      if (!segHasCR && seg.indexOf('"') === -1) {
        // Whole-line fast path.
        const parts = seg.split(',');
        for (let k = 0; k < parts.length; k++) fields.push(parts[k]);
        lastQuoted = false;
        pos = lf === -1 ? n : lf + 1;
        if (lf !== -1) line += 1;
        ended = lf === -1 ? END : LINE;
        break;
      }

      // Segment-attempt parse, appending to `fields`. `i` is the cursor
      // in seg; `embedded` counts line breaks inside quoted fields
      // (lone CRs; seg holds no LF). On an unterminated quote, stop:
      // the fields parsed so far (and their errors, already pushed)
      // stand, and the spanning field is read globally below.
      const segLen = seg.length;
      let i = 0;
      let embedded = 0;
      let failedAt = -1;
      let segDone = false;
      while (!segDone) {
        if (seg.charCodeAt(i) === 34) {
          lastQuoted = true;
          let q = seg.indexOf('"', i + 1);
          let escaped = false;
          while (q !== -1 && seg.charCodeAt(q + 1) === 34) { escaped = true; q = seg.indexOf('"', q + 2); }
          if (q === -1) { failedAt = i; break; }
          const raw = seg.slice(i + 1, q);
          const hasCR = segHasCR && raw.indexOf('\r') !== -1;
          let value;
          if (!escaped && !hasCR) value = raw;
          else {
            let v = escaped ? raw.replaceAll('""', '"') : raw;
            if (hasCR) {
              v = v.replace(/\r/g, '\n');
              let cnt = 0, idx = -1;
              while ((idx = v.indexOf('\n', idx + 1)) !== -1) cnt += 1;
              embedded += cnt;
            }
            value = v;
          }
          i = q + 1;
          if (i >= segLen) { fields.push(value); segDone = true; break; }
          const c = seg.charCodeAt(i);
          if (c === 44) { fields.push(value); i += 1; continue; }
          // Quote junk, up to the next comma or the segment end.
          const ci = seg.indexOf(',', i);
          const end = ci === -1 ? segLen : ci;
          const junk = seg.slice(i, end);
          if (segHasCR && junk.indexOf('\r') !== -1) {
            let added = 0, p = i;
            while (p < end) {
              if (seg.charCodeAt(p) === 13) { errors.push({ code: 'stray_cr', line: recordLine, row: recordRow }); p += 1; continue; }
              value += seg[p]; added += 1; p += 1;
            }
            if (added > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
          } else {
            if (junk.length > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
            value += junk;
          }
          fields.push(value);
          if (ci === -1) { segDone = true; break; }
          i = ci + 1;
        } else {
          lastQuoted = false;
          const ci = seg.indexOf(',', i);
          const end = ci === -1 ? segLen : ci;
          const f = seg.slice(i, end);
          if (segHasCR && f.indexOf('\r') !== -1) {
            let value = '', p = i;
            while (p < end) {
              if (seg.charCodeAt(p) === 13) { errors.push({ code: 'stray_cr', line: recordLine, row: recordRow }); p += 1; continue; }
              value += seg[p]; p += 1;
            }
            fields.push(value);
          } else {
            fields.push(f);
          }
          if (ci === -1) { segDone = true; break; }
          i = ci + 1;
        }
      }

      if (failedAt !== -1) {
        line += embedded;
        const r = readQuotedGlobal(pos + failedAt, recordLine, recordRow);
        fields.push(r[0]);
        lastQuoted = true;
        ended = r[1];
        // If it ended at a comma, loop for the rest of the record.
      } else {
        pos = lf === -1 ? n : lf + 1;
        line += embedded + (lf !== -1 ? 1 : 0);
        ended = lf === -1 ? END : LINE;
      }
    }

    // A line left with no characters (a single empty unquoted field)
    // is no record; its stray_cr errors stay.
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) { columns = fields; continue; }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
