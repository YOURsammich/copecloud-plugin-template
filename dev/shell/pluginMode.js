// How a plugin opens: docked in the sidebar, or in a floating draggable panel.
//
// The author picks a default — it travels with the plugin as `displayMode` on
// copecloud's apps row, because they are the ones who know whether the thing is
// a tool you glance at while chatting or an activity you sit in front of. A
// viewer who disagrees can move it, and that choice beats the default for them
// alone. Stored per plugin, so moving one does not move the rest.

const KEY = 'pluginMode';

export const MODES = ['sidebar', 'floating'];

export const DEFAULT_MODE = 'sidebar';

export function readOverrides() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY));
    // anything but a plain object means the key was clobbered; start over
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    // private mode, blocked storage, or corrupt JSON: no overrides, not a crash
    return {};
  }
}

export function writeOverrides(overrides) {
  try {
    localStorage.setItem(KEY, JSON.stringify(overrides));
  } catch {
    // quota or blocked storage: the override just will not survive a reload
  }
}

// The viewer's choice if they made one, else the author's, else docked.
// Unknown values are ignored rather than trusted, so a bad row or a hand-edited
// localStorage key cannot put the UI into a mode that renders nothing.
export function resolveMode(plugin, overrides) {
  const override = overrides?.[plugin?.appname];
  if (MODES.includes(override)) return override;
  if (MODES.includes(plugin?.displayMode)) return plugin.displayMode;
  return DEFAULT_MODE;
}
