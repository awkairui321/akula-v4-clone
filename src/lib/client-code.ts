/** Stable, five-character demo identifier; independent of name and email. */
export function clientCode(investorId: number): string {
  let value = Math.imul(investorId + 0x4b1d, 2654435761) >>> 0;
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"[value % 36];
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
  }
  return code;
}
