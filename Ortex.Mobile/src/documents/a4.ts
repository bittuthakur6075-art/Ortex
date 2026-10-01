// EVERY PDF the phone makes is one A4 portrait sheet: expo-print at A4 in points
// (72dpi), and each HTML template declares "@page { size: A4; margin: 0; }".
// test/a4Only.test.mjs fails if a PDF is printed anywhere else or any other way.
export const A4 = { width: 595, height: 842 }
