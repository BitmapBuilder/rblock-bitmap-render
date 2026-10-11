/**
 * Mondrian layout — squares packed into rows, each square taken from the
 * first gap large enough to hold it.
 *
 * Properties that matter for reproducing a bitmap exactly:
 * - Slot iteration/insertion order is preserved (rows keep slots sorted by
 *   x; new slots append or insert at the first larger x).
 * - place() is first-fit: scans rows in order, slots in order, and fills the
 *   first slot with r >= size.
 */

export interface Position {
  x: number;
  y: number;
}

export interface Slot {
  position: Position;
  r: number;
}

interface Row {
  y: number;
  slots: Slot[];
  map: Map<number, Slot>;
}

export class MondrianLayout {
  private readonly width: number;
  private readonly height: number;
  xMax = 0;
  yMax = 0;
  rowOffset = 0;
  rows: Row[] = [];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  getRow(position: Position): Row | null {
    if (position.y - this.rowOffset < this.rows.length) {
      return this.rows[position.y - this.rowOffset];
    }
    return null;
  }

  getSlot(position: Position): Slot | null {
    const row = this.getRow(position);
    if (row !== null && row.map.has(position.x)) {
      return row.map.get(position.x)!;
    }
    return null;
  }

  addRow(): Row {
    const newRow: Row = {
      y: this.rows.length + this.rowOffset,
      slots: [],
      map: new Map(),
    };
    this.rows.push(newRow);
    return newRow;
  }

  addSlot(slot: Slot): Slot | null {
    if (slot.r <= 0) return null;

    const existing = this.getSlot(slot.position);
    if (existing !== null) {
      existing.r = Math.max(existing.r, slot.r);
      return existing;
    }

    const row = this.getRow(slot.position);
    if (row === null) return null;

    let insertAt = -1;
    for (let i = 0; i < row.slots.length; i++) {
      if (row.slots[i].position.x > slot.position.x) {
        insertAt = i;
        break;
      }
    }

    if (insertAt === -1) {
      row.slots.push(slot);
    } else {
      row.slots.splice(insertAt, 0, slot);
    }

    row.map.set(slot.position.x, slot);
    return slot;
  }

  removeSlot(slot: Slot): void {
    const row = this.getRow(slot.position);
    if (row !== null) {
      row.map.delete(slot.position.x);
      for (let i = 0; i < row.slots.length; i++) {
        if (row.slots[i].position.x === slot.position.x) {
          row.slots.splice(i, 1);
          break;
        }
      }
    }
  }

  fillSlot(slot: Slot, squareWidth: number): Slot {
    const square = {
      left: slot.position.x,
      right: slot.position.x + squareWidth,
      bottom: slot.position.y,
      top: slot.position.y + squareWidth,
    };

    this.removeSlot(slot);

    for (let rowIndex = slot.position.y; rowIndex < square.top; rowIndex++) {
      const row = this.getRow({ x: slot.position.x, y: rowIndex });
      if (row !== null) {
        const collisions: Slot[] = [];
        let maxExcess = 0;
        for (const testSlot of row.slots) {
          if (
            !(testSlot.position.x + testSlot.r < square.left || testSlot.position.x >= square.right)
          ) {
            collisions.push(testSlot);
            const excess = Math.max(
              0,
              testSlot.position.x + testSlot.r - (slot.position.x + slot.r)
            );
            maxExcess = Math.max(maxExcess, excess);
          }
        }

        if (square.right < this.width && !row.map.has(square.right)) {
          this.addSlot({
            position: { x: square.right, y: rowIndex },
            r: slot.r - squareWidth + maxExcess,
          });
        }

        for (const collision of collisions) {
          collision.r = slot.position.x - collision.position.x;
          if (collision.r === 0) {
            this.removeSlot(collision);
          }
        }
      } else {
        this.addRow();
        if (slot.position.x > 0) {
          this.addSlot({ position: { x: 0, y: rowIndex }, r: slot.position.x });
        }
        if (square.right < this.width) {
          this.addSlot({
            position: { x: square.right, y: rowIndex },
            r: this.width - square.right,
          });
        }
      }
    }

    for (let rowIndex = Math.max(0, slot.position.y - squareWidth); rowIndex < slot.position.y; rowIndex++) {
      const row = this.getRow({ x: slot.position.x, y: rowIndex });
      if (row === null) continue;

      let i = 0;
      while (i < row.slots.length) {
        const testSlot = row.slots[i];

        if (
          testSlot.position.x < slot.position.x + squareWidth &&
          testSlot.position.x + testSlot.r > slot.position.x &&
          testSlot.position.y + testSlot.r >= slot.position.y
        ) {
          const oldSlotWidth = testSlot.r;
          testSlot.r = slot.position.y - testSlot.position.y;

          const remaining = {
            x: testSlot.position.x + testSlot.r,
            y: testSlot.position.y,
            width: oldSlotWidth - testSlot.r,
            height: testSlot.r,
          };

          while (remaining.width > 0 && remaining.height > 0) {
            if (remaining.width <= remaining.height) {
              this.addSlot({ position: { x: remaining.x, y: remaining.y }, r: remaining.width });
              remaining.y += remaining.width;
              remaining.height -= remaining.width;
            } else {
              this.addSlot({ position: { x: remaining.x, y: remaining.y }, r: remaining.height });
              remaining.x += remaining.height;
              remaining.width -= remaining.height;
            }
          }
        }
        i++;
      }
    }

    return { position: slot.position, r: squareWidth };
  }

  place(size: number): Slot {
    let placed: Slot | undefined;

    outer: for (const row of this.rows) {
      for (const slot of row.slots) {
        if (slot.r >= size) {
          placed = this.fillSlot(slot, size);
          break outer;
        }
      }
    }

    if (!placed) {
      const row = this.addRow();
      const slot = this.addSlot({ position: { x: 0, y: row.y }, r: this.width })!;
      placed = this.fillSlot(slot, size);
    }

    if (placed.position.x + placed.r > this.xMax) {
      this.xMax = placed.position.x + placed.r;
    }
    if (placed.position.y + placed.r > this.yMax) {
      this.yMax = placed.position.y + placed.r;
    }

    return placed;
  }
}
