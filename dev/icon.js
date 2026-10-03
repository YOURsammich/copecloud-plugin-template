//Your plugin's icon: plugin/public/icon.svg, .png, .webp or .jpg, shown on
//the chatroom's plugin bar and in its Play menu. Same rules as copecloud's
//(modules/app_icon.js there): one icon, up to 256 KB, SVG preferred if there
//is more than one.

const fs = require('fs');
const path = require('path');

const { PLUGIN_DIR } = require('./build');

const ICON_TYPES = {
  svg: 'image/svg+xml',
  png: 'image/png',
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg'
};

const MAX_ICON_BYTES = 256 * 1024;

//{ rel: 'public/icon.png', file, type } for the icon in plugin/, or null
function findIcon () {
  for (const ext of Object.keys(ICON_TYPES)) {
    const rel = 'public/icon.' + ext;
    const file = path.join(PLUGIN_DIR, rel);
    if (fs.existsSync(file)) return { rel, file, type: ICON_TYPES[ext] };
  }
  return null;
}

function isIconPath (rel) {
  return Object.keys(ICON_TYPES).some(ext => rel === 'public/icon.' + ext);
}

module.exports = {
  ICON_TYPES,
  MAX_ICON_BYTES,
  findIcon,
  isIconPath
};
