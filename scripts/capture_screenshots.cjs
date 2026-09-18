const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const MOD_DETAILS_DATABASE = {
  'space-exploration': {
    name: 'space-exploration',
    title: 'Space Exploration',
    owner: 'Earendel',
    summary: 'Build cargo rockets, launch into orbit, explore planets, moons, asteroids, and stars, build massive orbital science installations and spaceships.',
    downloads: 1240500,
    thumbnail: 'https://assets-mod.factorio.com/assets/2cb776eb8bfa754160408ea2d15926c483a93bb3.png',
    dependencies: ['? aai-industry', 'alien-biomes >= 0.6.0', 'flib >= 0.14.0', 'informatron >= 0.4.0', 'jetpack >= 0.4.0', 'shield-projector >= 0.2.0'],
    releases: [
      {
        version: '0.6.140',
        factorioVersion: '2.0',
        releasedAt: '2026-02-14T10:00:00Z',
        downloadsCount: 145000,
        fileSize: 48234496,
        sha1: '3a7c1e592f890b395d826a117b4c91e0a248f763',
        dependencies: ['? aai-industry', 'alien-biomes >= 0.6.0', 'flib >= 0.14.0', 'informatron >= 0.4.0', 'jetpack >= 0.4.0', 'shield-projector >= 0.2.0']
      },
      {
        version: '0.6.139',
        factorioVersion: '2.0',
        releasedAt: '2026-01-20T10:00:00Z',
        downloadsCount: 85000,
        fileSize: 48190000,
        sha1: '9b2c8a11e4f509d3b87a02c91847e192a8374829',
        dependencies: []
      }
    ]
  },
  'flib': {
    name: 'flib',
    title: 'Factorio Library',
    owner: 'raiguard',
    summary: 'A set of high-quality, commonly-used utilities for creating Factorio mods.',
    downloads: 1850000,
    thumbnail: 'https://assets-mod.factorio.com/assets/9417eb733a1e26aa5f81eec9f6f698b671a5c60c.png',
    dependencies: [],
    releases: [
      {
        version: '0.16.5',
        factorioVersion: '2.0',
        releasedAt: '2025-11-05T10:00:00Z',
        downloadsCount: 520000,
        fileSize: 184500,
        sha1: '5f9b2c8a11e4f509d3b87a02c91847e192a83748',
        dependencies: []
      }
    ]
  },
  'alien-biomes': {
    name: 'alien-biomes',
    title: 'Alien Biomes',
    owner: 'Earendel',
    summary: 'A collection of additional biomes: Snow, Volcanic, Crater, various colors of Dirt, Sand, and Grass. Includes new tree and decorative graphics.',
    downloads: 980000,
    thumbnail: 'https://assets-mod.factorio.com/assets/5863261a87750849646b95b4526df61a499d1078.png',
    dependencies: [],
    releases: [
      {
        version: '0.6.8',
        factorioVersion: '2.0',
        releasedAt: '2025-12-10T10:00:00Z',
        downloadsCount: 310000,
        fileSize: 12450000,
        sha1: '6a8c0e292f790b395d826a117b4c91e0a248f763',
        dependencies: []
      }
    ]
  },
  'informatron': {
    name: 'informatron',
    title: 'Informatron',
    owner: 'Earendel',
    summary: 'The helpful information directory and guide to the galaxy. Allows mods to put help and documentation pages in-game.',
    downloads: 870000,
    thumbnail: 'https://assets-mod.factorio.com/assets/f41249b6579cfef6fcf900b73ea74ae6ad3ba2f8.png',
    dependencies: [],
    releases: [
      {
        version: '0.5.0',
        factorioVersion: '2.0',
        releasedAt: '2025-11-20T10:00:00Z',
        downloadsCount: 290000,
        fileSize: 1450000,
        sha1: '7b9c1e392f890b395d826a117b4c91e0a248f763',
        dependencies: []
      }
    ]
  },
  'jetpack': {
    name: 'jetpack',
    title: 'Jetpack',
    owner: 'Earendel',
    summary: 'Lets you build jetpack equipment that lets you rocket at high speeds to fly over buildings and water.',
    downloads: 840000,
    thumbnail: 'https://assets-mod.factorio.com/assets/7be55913256ba12c77d612e4315907297e2978ee.png',
    dependencies: [],
    releases: [
      {
        version: '0.5.1',
        factorioVersion: '2.0',
        releasedAt: '2025-11-22T10:00:00Z',
        downloadsCount: 280000,
        fileSize: 2450000,
        sha1: '8c0d2e492f890b395d826a117b4c91e0a248f763',
        dependencies: []
      }
    ]
  },
  'aai-industry': {
    name: 'aai-industry',
    title: 'AAI Industry',
    owner: 'Earendel',
    summary: 'The industry part of Advanced Autonomous Industries. Adds burner machines, some new intermediate ingredients, powered offshore pump, and burner lab.',
    downloads: 780000,
    thumbnail: 'https://assets-mod.factorio.com/assets/4ea317c91a7e28b1853ba5faecbbf2bdfa576356.png',
    dependencies: [],
    releases: [
      {
        version: '0.7.4',
        factorioVersion: '2.0',
        releasedAt: '2025-11-18T10:00:00Z',
        downloadsCount: 260000,
        fileSize: 3100000,
        sha1: '9d1e3f592f890b395d826a117b4c91e0a248f763',
        dependencies: []
      }
    ]
  },
  'aai-containers': {
    name: 'aai-containers',
    title: 'AAI Containers & Warehouses',
    owner: 'Earendel',
    summary: 'A set of containers in the Factorio style with multiple options for inventory sizes. Chest 1x1, Strongbox 2x2, Storehouse 4x4, and Warehouse 6x6.',
    downloads: 820000,
    thumbnail: 'https://assets-mod.factorio.com/assets/26fcf4a307c139c183cf9376666ba8a1ffdf92e2.png',
    dependencies: [],
    releases: [
      {
        version: '0.4.0',
        factorioVersion: '2.0',
        releasedAt: '2025-11-15T10:00:00Z',
        downloadsCount: 270000,
        fileSize: 2100000,
        sha1: '0e2f4a692f890b395d826a117b4c91e0a248f763',
        dependencies: []
      }
    ]
  },
  'shield-projector': {
    name: 'shield-projector',
    title: 'Shield Projector',
    owner: 'Earendel',
    summary: 'Projects an energy shield in an arc, a wall that only needs energy to sustain it. Designed for Space Exploration & AAI Industry.',
    downloads: 720000,
    thumbnail: 'https://assets-mod.factorio.com/assets/ebdbce80f769032649b5c2c5c93540eb406a6448.png',
    dependencies: [],
    releases: [
      {
        version: '0.3.0',
        factorioVersion: '2.0',
        releasedAt: '2025-11-25T10:00:00Z',
        downloadsCount: 240000,
        fileSize: 1850000,
        sha1: '1f3a5b792f890b395d826a117b4c91e0a248f763',
        dependencies: []
      }
    ]
  },
  'factoryplanner': {
    name: 'factoryplanner',
    title: 'Factory Planner',
    owner: 'Therenas',
    summary: 'Allows you to plan out your factories from desired products down to raw ingredients with rates, module support, and sub-factories.',
    downloads: 1450000,
    thumbnail: 'https://assets-mod.factorio.com/assets/b8ff7cf8b958e0a158b0906be75394017325c276.png',
    dependencies: [],
    releases: [
      {
        version: '1.2.16',
        factorioVersion: '2.0',
        releasedAt: '2026-02-01T10:00:00Z',
        downloadsCount: 450000,
        fileSize: 950000,
        sha1: '2a4b6c892f890b395d826a117b4c91e0a248f763',
        dependencies: []
      }
    ]
  },
  'helmod': {
    name: 'helmod',
    title: 'Helmod: Assistant for planning your factory',
    owner: 'Helfima',
    summary: 'Helps plan production lines, calculate machines and resources required for your target production rates.',
    downloads: 1620000,
    thumbnail: 'https://assets-mod.factorio.com/assets/9417eb733a1e26aa5f81eec9f6f698b671a5c60c.png',
    dependencies: [],
    releases: [
      {
        version: '2.0.2',
        factorioVersion: '2.0',
        releasedAt: '2026-01-15T10:00:00Z',
        downloadsCount: 480000,
        fileSize: 1200000,
        sha1: '3b5c7d992f890b395d826a117b4c91e0a248f763',
        dependencies: []
      }
    ]
  },
  'RateCalculator': {
    name: 'RateCalculator',
    title: 'Rate Calculator',
    owner: 'Raiguard',
    summary: 'Select a group of machines to calculate maximum production and consumption rates.',
    downloads: 1100000,
    thumbnail: 'https://assets-mod.factorio.com/assets/2cb776eb8bfa754160408ea2d15926c483a93bb3.png',
    dependencies: [],
    releases: [
      {
        version: '3.3.4',
        factorioVersion: '2.0',
        releasedAt: '2025-11-28T10:00:00Z',
        downloadsCount: 390000,
        fileSize: 420000,
        sha1: '4c6d8e092f890b395d826a117b4c91e0a248f763',
        dependencies: []
      }
    ]
  },
  'RecipeBook': {
    name: 'RecipeBook',
    title: 'Recipe Book',
    owner: 'Raiguard',
    summary: 'Search for information about recipes, materials, machines, technologies, and more in a clean interactive UI.',
    downloads: 940000,
    thumbnail: 'https://assets-mod.factorio.com/assets/5863261a87750849646b95b4526df61a499d1078.png',
    dependencies: [],
    releases: [
      {
        version: '3.5.9',
        factorioVersion: '2.0',
        releasedAt: '2026-02-10T10:00:00Z',
        downloadsCount: 340000,
        fileSize: 680000,
        sha1: '5d7e9f192f890b395d826a117b4c91e0a248f763',
        dependencies: []
      }
    ]
  }
};

const BROWSE_MODS = Object.values(MOD_DETAILS_DATABASE).map(d => ({
  name: d.name,
  title: d.title,
  downloads: d.downloads,
  latestVersion: d.releases[0].version,
  factorioVersion: d.releases[0].factorioVersion,
  summary: d.summary
}));

async function main() {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--force-device-scale-factor=1.5',
      '--window-size=1440,900'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.5 });
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

  await page.evaluateOnNewDocument((db, browseMods) => {
    let callbackIdCounter = 1;
    const callbacks = new Map();

    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd, args) => {
        // Core Ping
        if (cmd === 'ping') return 'pong';

        // Version
        if (cmd === 'plugin:app|version') return '1.0.0';

        // Settings
        if (cmd === 'get_settings') {
          return {
            modsDir: null,
            gameDir: 'D:\\Games\\Factorio',
            targetFactorioVersion: '2.0',
            logLevel: 'info',
            activePackId: 'space-exploration-overhaul',
            checkForUpdates: true,
            dismissedUpdateVersion: null
          };
        }

        // Detection Status
        if (cmd === 'get_detection_status') {
          return {
            isDetected: true,
            game: {
              installDir: 'D:\\Games\\Factorio',
              exePath: 'D:\\Games\\Factorio\\bin\\x64\\factorio.exe',
              version: '2.0.72',
              targetVersion: '2.0',
              portableModsDir: null,
              source: 'Standalone'
            },
            effectiveModsDir: 'C:\\Users\\ANXOMXR\\AppData\\Roaming\\Factorio\\mods'
          };
        }

        // Vanilla Info
        if (cmd === 'get_vanilla_info') {
          return { expansionAvailable: true };
        }

        // Installed Mods
        if (cmd === 'list_installed') {
          const installedList = [
            { name: 'base', version: '2.0.72', enabled: true },
            { name: 'space-age', version: '2.0.72', enabled: true },
            { name: 'quality', version: '2.0.72', enabled: true },
            { name: 'elevated-rails', version: '2.0.72', enabled: true },
            { name: 'flib', version: '0.16.5', enabled: true },
            { name: 'space-exploration', version: '0.6.140', enabled: true },
            { name: 'alien-biomes', version: '0.6.8', enabled: true },
            { name: 'informatron', version: '0.5.0', enabled: true },
            { name: 'jetpack', version: '0.5.1', enabled: true },
            { name: 'shield-projector', version: '0.3.0', enabled: true },
            { name: 'aai-industry', version: '0.7.4', enabled: true },
            { name: 'aai-containers', version: '0.4.0', enabled: true },
            { name: 'factoryplanner', version: '1.2.14', enabled: true },
            { name: 'helmod', version: '2.0.2', enabled: true },
            { name: 'RateCalculator', version: '3.3.4', enabled: true },
            { name: 'RecipeBook', version: '3.5.7', enabled: true },
            { name: 'even-distribution', version: '2.0.1', enabled: true },
            { name: 'Squeak Through 2', version: '1.0.3', enabled: true }
          ].map(m => ({
            fileName: `${m.name}_${m.version}.zip`,
            name: m.name,
            version: m.version,
            factorioVersion: '2.0',
            enabled: m.enabled,
            dependencies: [],
            problem: null
          }));

          return {
            modsDir: 'C:\\Users\\ANXOMXR\\AppData\\Roaming\\Factorio\\mods',
            modListExists: true,
            mods: installedList
          };
        }

        // Mod Packs
        if (cmd === 'list_packs') {
          return [
            { id: 'space-exploration-overhaul', name: 'Space Exploration Overhaul', modCount: 18, createdAt: Date.now() - 3600000 },
            { id: 'qol-essentials', name: 'QoL Essentials', modCount: 6, createdAt: Date.now() - 86400000 },
            { id: 'megabase-logistics', name: 'MegaBase Logistics', modCount: 12, createdAt: Date.now() - 172800000 }
          ];
        }

        // Storage Report
        if (cmd === 'get_storage_report') {
          return {
            modsDir: 'C:\\Users\\ANXOMXR\\AppData\\Roaming\\Factorio\\mods',
            totalSizeBytes: 155823411,
            zipCount: 18,
            orphans: [],
            orphanSizeBytes: 0,
            perMod: []
          };
        }

        // Updates
        if (cmd === 'check_updates') {
          return {
            target: '2.0',
            updates: [
              { name: 'factoryplanner', installedVersion: '1.2.14', availableVersion: '1.2.16', factorioVersion: '2.0' },
              { name: 'RecipeBook', installedVersion: '3.5.7', availableVersion: '3.5.9', factorioVersion: '2.0' }
            ],
            upToDate: ['flib', 'space-exploration', 'alien-biomes'],
            errors: []
          };
        }

        // Validation
        if (cmd === 'validate_mods_dir') {
          return {
            path: 'C:\\Users\\ANXOMXR\\AppData\\Roaming\\Factorio\\mods',
            exists: true,
            isDir: true,
            writable: true,
            creatable: true,
            zipCount: 18,
            hasModList: true
          };
        }

        // Search Mods
        if (cmd === 'search_mods') {
          return {
            results: browseMods,
            page: 1,
            pageCount: 48,
            totalCount: 1142
          };
        }

        // Mod Details
        if (cmd === 'get_mod_details') {
          const mod = db[args.name];
          if (mod) return mod;
          return {
            name: args.name,
            title: args.name,
            owner: 'Unknown',
            summary: 'A Factorio mod',
            downloads: 10000,
            thumbnail: null,
            dependencies: [],
            releases: [{ version: '1.0.0', factorioVersion: '2.0', releasedAt: null, downloadsCount: 10000, fileSize: 1000000, dependencies: [] }]
          };
        }

        // Resolve Install Plan
        if (cmd === 'resolve_install_plan') {
          return {
            rootName: args.name || 'space-exploration',
            target: args.version || '0.6.140',
            toInstall: [
              { name: 'space-exploration', title: 'Space Exploration', version: '0.6.140', factorioVersion: '2.0', requiredBy: 'user', depsKnown: true },
              { name: 'alien-biomes', title: 'Alien Biomes', version: '0.6.8', factorioVersion: '2.0', requiredBy: 'space-exploration', depsKnown: true },
              { name: 'informatron', title: 'Informatron', version: '0.5.0', factorioVersion: '2.0', requiredBy: 'space-exploration', depsKnown: true },
              { name: 'jetpack', title: 'Jetpack', version: '0.5.1', factorioVersion: '2.0', requiredBy: 'space-exploration', depsKnown: true },
              { name: 'shield-projector', title: 'Shield Projector', version: '0.3.0', factorioVersion: '2.0', requiredBy: 'space-exploration', depsKnown: true }
            ],
            satisfied: [
              { name: 'flib', version: '0.16.5' }
            ],
            optional: ['aai-industry'],
            conflicts: [],
            warnings: []
          };
        }

        // Events
        if (cmd === 'plugin:event|listen') {
          return callbackIdCounter++;
        }
        if (cmd === 'plugin:event|unlisten') {
          return null;
        }

        return null;
      },

      transformCallback: (cb, once) => {
        const id = callbackIdCounter++;
        callbacks.set(id, cb);
        return id;
      },
      unregisterCallback: (id) => callbacks.delete(id),
      runCallback: (id, data) => {
        const cb = callbacks.get(id);
        if (cb) cb(data);
      },
      callbacks: callbacks
    };

    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: (event, id) => callbacks.delete(id)
    };
  }, MOD_DETAILS_DATABASE, BROWSE_MODS);

  // 1. Capture Dashboard
  console.log('Navigating to Dashboard...');
  await page.goto('http://localhost:1420', { waitUntil: 'networkidle0' });
  await page.waitForSelector('main');
  await new Promise(r => setTimeout(r, 1200)); // Allow animations to settle

  // Add some realistic recent activity to activity store
  await page.evaluate(() => {
    // Access zustand store if available
    try {
      const { useActivityStore } = window;
    } catch(e) {}
  });

  const outDir = path.resolve(__dirname, '..', 'docs', 'screenshots');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const dashboardPath = path.join(outDir, 'dashboard.png');
  await page.screenshot({ path: dashboardPath });
  console.log('Saved:', dashboardPath);

  // 2. Navigate to Browse
  console.log('Navigating to Browse page...');
  const browseBtn = await page.$('button[aria-label="Browse"], nav button:nth-child(2)');
  if (browseBtn) {
    await browseBtn.click();
  } else {
    // Click by finding button with text Browse
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('nav button'));
      const b = buttons.find(btn => btn.textContent.includes('Browse'));
      if (b) b.click();
    });
  }

  await page.waitForSelector('input[placeholder*="Search"]');
  await new Promise(r => setTimeout(r, 1000));

  const browsePath = path.join(outDir, 'browse.png');
  await page.screenshot({ path: browsePath });
  console.log('Saved:', browsePath);

  // 3. Open Install Modal on Space Exploration
  console.log('Opening Install Modal on Space Exploration...');
  const card = await page.waitForSelector('div[aria-label="View details for Space Exploration"]', { timeout: 5000 });
  if (card) {
    await card.click();
    console.log('Clicked Space Exploration card');
  }

  await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
  await new Promise(r => setTimeout(r, 1500)); // Allow modal animations & plan to settle

  const installPlanPath = path.join(outDir, 'install-plan.png');
  await page.screenshot({ path: installPlanPath });
  console.log('Saved:', installPlanPath);

  await browser.close();
  console.log('ALL SCREENSHOTS CAPTURED SUCCESSFULLY!');
}

main().catch(err => {
  console.error('ERROR CAPTURING SCREENSHOTS:', err);
  process.exit(1);
});
