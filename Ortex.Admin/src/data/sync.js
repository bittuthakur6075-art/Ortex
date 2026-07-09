import { supabase, hasSupabase } from "./supabaseClient"
import { apiStore } from "./apiStore"

const PREFIX = "ortex_admin_"
const SETTINGS_KEY = "ortex_admin_settings"
const SYNC_FLAG = "ortex_supabase_migrated"

// Helper to check if a string is a valid UUID
const isUuid = (v) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

// Deterministic UUID derived from the old local id. Crucial for idempotency:
// re-running the migration (e.g. after a mid-run failure) must map each old id
// to the SAME new id so an upsert overwrites the earlier row instead of the old
// Math.random() approach, which minted fresh ids every run and duplicated all
// data into the shared database. Not cryptographic — just a stable, well-spread
// hash formatted as a v4-shaped UUID.
function deterministicUuid(str) {
  const fnv = (seed) => {
    let hash = seed >>> 0
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i)
      hash = Math.imul(hash, 0x01000193) >>> 0
    }
    return hash >>> 0
  }
  const hx = (n) => (n >>> 0).toString(16).padStart(8, "0")
  const hex = hx(fnv(0x811c9dc5)) + hx(fnv(0x01234567)) + hx(fnv(0x9e3779b9)) + hx(fnv(0x85ebca6b))
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

// Deep replacement helper to replace all occurrences of old IDs with new UUIDs inside documents
function replaceIds(obj, idMap) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") {
    return idMap[obj] || obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => replaceIds(item, idMap));
  }
  if (typeof obj === "object") {
    const next = {};
    for (const key in obj) {
      next[key] = replaceIds(obj[key], idMap);
    }
    return next;
  }
  return obj;
}

export async function syncLocalToSupabase() {
  if (!hasSupabase) return;
  if (localStorage.getItem(SYNC_FLAG) === "true") return;

  try {
    const collections = [
      "categories",
      "products",
      "customers",
      "enquiries",
      "leads",
      "quotations",
      "invoices",
      "payments",
      "message_templates",
      "automation_rules",
      "user_activities",
      "event_logs",
      "whatsapp_logs",
      "ai_messages"
    ];

    // 1. Gather all collections from localStorage
    const localData = {};
    let hasLocalData = false;

    for (const name of collections) {
      try {
        const raw = localStorage.getItem(PREFIX + name);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            localData[name] = parsed;
            hasLocalData = true;
          }
        }
      } catch (e) {
        console.warn(`Failed to parse local collection ${name}:`, e);
      }
    }

    // If there is no local data at all, mark as migrated and exit
    if (!hasLocalData) {
      localStorage.setItem(SYNC_FLAG, "true");
      return;
    }

    console.log("Starting local to Supabase database migration...");

    // 2. Generate a map of all old non-UUID IDs to new UUIDs
    const idMap = {};
    for (const name of collections) {
      const items = localData[name] || [];
      for (const item of items) {
        if (item && item.id && !isUuid(item.id)) {
          idMap[item.id] = deterministicUuid(item.id);
        }
      }
    }

    // 3. Migrate settings if present
    try {
      const rawSettings = localStorage.getItem(SETTINGS_KEY);
      if (rawSettings) {
        const parsedSettings = JSON.parse(rawSettings);
        if (parsedSettings) {
          // Replace any ID references inside settings (like default template/rule IDs)
          const cleanSettings = replaceIds(parsedSettings, idMap);
          await apiStore.saveSettings(cleanSettings);
          console.log("Settings migrated successfully.");
        }
      }
    } catch (e) {
      console.warn("Failed to migrate settings:", e);
    }

    // 4. Transform and upload collections one by one
    for (const name of collections) {
      const items = localData[name];
      if (!items || items.length === 0) continue;

      console.log(`Migrating collection '${name}' (${items.length} items)...`);

      const rows = items.map((item) => {
        const newId = idMap[item.id] || item.id;
        
        // Strip out database-managed fields from the doc payload
        const { id, createdAt, updatedAt, created_at, updated_at, ...doc } = item;
        
        // Replace all internal references in the document body
        const cleanDoc = replaceIds(doc, idMap);

        return {
          id: newId,
          doc: cleanDoc,
          created_at: createdAt || created_at || new Date().toISOString(),
          updated_at: updatedAt || updated_at || new Date().toISOString()
        };
      });

      // Upsert (not insert) in chunks so a re-run after a partial failure
      // overwrites the rows it already wrote instead of duplicating them. Safe
      // because ids are now deterministic.
      const chunkSize = 50;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const { error } = await supabase.from(name).upsert(chunk, { onConflict: "id" });
        if (error) {
          throw new Error(`Failed to upsert chunk for ${name}: ${error.message}`);
        }
      }
      console.log(`Collection '${name}' migrated successfully.`);
    }

    // 5. Mark migration as complete
    localStorage.setItem(SYNC_FLAG, "true");
    console.log("Database migration completed successfully!");
  } catch (err) {
    console.error("Supabase migration error:", err);
  }
}
