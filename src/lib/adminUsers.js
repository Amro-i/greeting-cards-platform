import { supabase } from './supabase';

export async function invokeAdminUsers(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke('admin-manage-user', {
    body: { action, ...payload },
  });

  if (error) {
    let message = error.message || 'تعذر تنفيذ العملية.';
    try {
      const details = await error.context?.json?.();
      message = details?.error || details?.message || message;
    } catch {
      // Keep the original Supabase Functions error message.
    }
    throw new Error(message);
  }

  if (data?.error) throw new Error(data.error);
  return data;
}
