import { supabase, hasSupabase } from "./supabaseClient"
import { apiStore } from "./apiStore"

const PREFIX = "ortex_admin_"
const SETTINGS_KEY = "ortex_admin_settings"
const SYNC_FLAG = "ortex_supabase_migrated"

// Helper to check if a string is a valid UUID
const isUuid = (v) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

// Helper to generate a UUID (standard v4 representation)
function generateUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
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
          idMap[item.id] = generateUuid();
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

      // Insert in chunks of 50 to avoid any database payload limits
      const chunkSize = 50;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const { error } = await supabase.from(name).insert(chunk);
        if (error) {
          throw new Error(`Failed to insert chunk for ${name}: ${error.message}`);
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
