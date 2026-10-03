import { useState } from 'react';

// A plugin's icon, wherever plugins are listed (the plugin bar, the Play menu).
// Its author uploads it on copecloud, which serves it from the plugin host and
// puts the URL on the plugin's record as `icon`. Without one, or if it fails to
// load, the plugin gets the first letter of its name on a colour worked out
// from the name, so every plugin keeps the same look and two plugins rarely
// share one.

export function monogram(appname) {
  const name = String(appname || '');
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return {
    letter: (name.match(/[a-z0-9]/i)?.[0] ?? '?').toUpperCase(),
    hue: hash % 360,
  };
}

// Only an http(s) URL is used as an image; anything else gets the letter.
function iconSrc(plugin) {
  const icon = plugin?.icon;
  return typeof icon === 'string' && /^https?:\/\//i.test(icon) ? icon : null;
}

function PluginIcon({ plugin, size = 40, className = '' }) {
  // The URL that failed, so a new icon (a new URL) gets its own chance.
  const [failed, setFailed] = useState(null);
  const src = iconSrc(plugin);
  const style = { width: size, height: size };

  if (src && failed !== src) {
    return (
      <img
        className={'pluginIcon ' + className}
        style={style}
        src={src}
        alt=''
        draggable={false}
        onError={() => setFailed(src)}
      />
    );
  }

  const { letter, hue } = monogram(plugin?.appname);
  return (
    <span
      className={'pluginIcon pluginIconLetter ' + className}
      style={{ ...style, fontSize: Math.round(size * 0.5), background: `hsl(${hue} 45% 34%)` }}
      aria-hidden='true'
    >
      {letter}
    </span>
  );
}

export default PluginIcon;
