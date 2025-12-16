import { AuthenticationCreds, AuthenticationState, BufferJSON, initAuthCreds, SignalDataTypeMap } from '@whiskeysockets/baileys';
import { SupabaseClient } from '@supabase/supabase-js';

export const useSupabaseAuthState = async (supabase: SupabaseClient): Promise<{ state: AuthenticationState, saveCreds: () => Promise<void> }> => {
  const TABLE_NAME = 'auth_sessions_baileys';

  // Read Creds
  const readData = async (key: string) => {
    const { data } = await supabase.from(TABLE_NAME).select('value').eq('key', key).single();
    return data?.value ? JSON.parse(data.value, BufferJSON.reviver) : null;
  };

  // Write Data
  const writeData = async (key: string, value: any) => {
    const stringified = JSON.stringify(value, BufferJSON.replacer);
    await supabase.from(TABLE_NAME).upsert({ key, value: stringified });
  };

  // Remove Data
  const removeData = async (key: string) => {
    await supabase.from(TABLE_NAME).delete().eq('key', key);
  };

  const creds: AuthenticationCreds = (await readData('creds')) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data: { [key: string]: any } = {};
          await Promise.all(ids.map(async id => {
            const key = `${type}-${id}`;
            const value = await readData(key);
            if (value) {
              data[id] = value;
            }
          }));
          return data;
        },
        set: async (data: any) => {
          for (const category in data) {
            for (const id in data[category]) {
              const key = `${category}-${id}`;
              const value = data[category][id];
              if (value) {
                await writeData(key, value);
              } else {
                await removeData(key);
              }
            }
          }
        }
      }
    },
    saveCreds: async () => {
      await writeData('creds', creds);
    }
  };
};
