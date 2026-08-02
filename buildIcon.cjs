const { Jimp, cssColorToHex } = require('jimp');

const BITMAP = [
  " 111   11111  11111         1111   111   1    ",
  "1   1  1      1            1      1   1  1    ",
  "1   1  111    111    111    111   1   1  1    ",
  "1   1  1      1                1  1   1  1    ",
  " 111   1      1            1111    111   11111"
];
const COLORS = ['#90EE90', '#39ff14', '#00ff41', '#4A6B2C', '#6b8e23'];

function getHexColor(colorStr) {
  return parseInt(colorStr.replace('#', '') + 'FF', 16);
}

async function run() {
  const imgSize = 1024;
  
  let image;
  try {
     image = new Jimp({ width: imgSize, height: imgSize, color: 0x05050aff });
  } catch(e) {
     const JimpClass = require('jimp');
     image = new JimpClass(imgSize, imgSize, 0x05050aff);
  }

  const rows = BITMAP.length;
  const cols = BITMAP[0].length;
  const margin = 50;
  
  const innerWidth = imgSize - (margin * 2);
  const cellSize = Math.floor(innerWidth / cols);
  
  const actualWidth = cols * cellSize;
  const actualHeight = rows * cellSize;
  const offsetX = Math.floor((imgSize - actualWidth) / 2);
  const offsetY = Math.floor((imgSize - actualHeight) / 2);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (BITMAP[r][c] === '1') {
        const hexColor = COLORS[Math.floor(Math.random() * COLORS.length)];
        const jimpColor = getHexColor(hexColor);
        
        for (let y = 0; y < cellSize - 8; y++) {
          for (let x = 0; x < cellSize - 8; x++) {
             image.setPixelColor(jimpColor, offsetX + c * cellSize + x, offsetY + r * cellSize + y);
          }
        }
      }
    }
  }

  const path = require('path');
  const deskPath = path.join(require('os').homedir(), 'Desktop', 'OffSol_Logo.png');
  
  await image.write(deskPath);
  
  const fs = require('fs');
  if(!fs.existsSync('./resources')) fs.mkdirSync('./resources');
  await image.write('./resources/icon.png');
  await image.write('./resources/splash.png');
  
  console.log("Logo generated at " + deskPath);
}

run().catch(console.error);
