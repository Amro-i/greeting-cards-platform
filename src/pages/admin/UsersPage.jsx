import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Edit3,
  KeyRound,
  LoaderCircle,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserRoundCog,
  UserX,
  UsersRound,
  X,
} from 'lucide-react';
import ConfirmModal from '../../components/ConfirmModal';
import { useAuth } from '../../context/AuthContext';
import { invokeAdminUsers } from '../../lib/adminUsers';

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  viewer: 'Viewer',
};

const EMPTY_FORM = {
  id: '',
  fullName: '',
  email: '',
  password: '',
  role: 'viewer',
  isActive: true,
};

function formatDate(value) {
  if (!value) return 'لم يسجل الدخول';
  return new Intl.DateTimeFormat('ar-SA-u-nu-latn', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default function UsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const editing = Boolean(form.id);

  async function loadUsers() {
    setLoading(true);
    setError('');
    try {
      const result = await invokeAdminUsers('list');
      setUsers(result.users || []);
    } catch (loadError) {
      setError(loadError.message || 'تعذر تحميل مستخدمي الإدارة. تأكد من نشر Edge Function.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((item) => {
      const matchesSearch = !term
        || item.full_name?.toLowerCase().includes(term)
        || item.email?.toLowerCase().includes(term);
      const matchesRole = roleFilter === 'all' || item.role === roleFilter;
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'active' ? item.is_active : !item.is_active);
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, search, roleFilter, statusFilter]);

  const summary = useMemo(() => ({
    total: users.length,
    active: users.filter((item) => item.is_active).length,
    admins: users.filter((item) => item.role === 'super_admin' || item.role === 'admin').length,
    viewers: users.filter((item) => item.role === 'viewer').length,
  }), [users]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setError('');
    setNotice('');
    setModalOpen(true);
  }

  function openEdit(item) {
    setForm({
      id: item.id,
      fullName: item.full_name || '',
      email: item.email || '',
      password: '',
      role: item.role || 'viewer',
      isActive: Boolean(item.is_active),
    });
    setError('');
    setNotice('');
    setModalOpen(true);
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setNotice('');

    if (form.fullName.trim().length < 2) {
      setError('اكتب الاسم الكامل بشكل صحيح.');
      return;
    }
    if (!form.email.trim()) {
      setError('اكتب البريد الإلكتروني.');
      return;
    }
    if (!editing && form.password.length < 8) {
      setError('كلمة المرور يجب ألا تقل عن 8 أحرف.');
      return;
    }
    if (editing && form.password && form.password.length < 8) {
      setError('كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف.');
      return;
    }

    setBusy(true);
    try {
      if (editing) {
        await invokeAdminUsers('update', {
          userId: form.id,
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          password: form.password || undefined,
          role: form.role,
          isActive: form.isActive,
        });
        setNotice('تم تحديث المستخدم بنجاح.');
      } else {
        await invokeAdminUsers('create', {
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role,
          isActive: form.isActive,
        });
        setNotice('تم إنشاء المستخدم بنجاح.');
      }
      setModalOpen(false);
      setForm(EMPTY_FORM);
      await loadUsers();
    } catch (submitError) {
      setError(submitError.message || 'تعذر حفظ المستخدم.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleUser(item) {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await invokeAdminUsers('update', {
        userId: item.id,
        fullName: item.full_name,
        email: item.email,
        role: item.role,
        isActive: !item.is_active,
      });
      setNotice(item.is_active ? 'تم تعطيل الحساب.' : 'تم تفعيل الحساب.');
      await loadUsers();
    } catch (toggleError) {
      setError(toggleError.message || 'تعذر تغيير حالة الحساب.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteUser() {
    if (!deleteTarget) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await invokeAdminUsers('delete', { userId: deleteTarget.id });
      setDeleteTarget(null);
      setNotice('تم حذف المستخدم نهائيًا.');
      await loadUsers();
    } catch (deleteError) {
      setError(deleteError.message || 'تعذر حذف المستخدم.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>مستخدمو الإدارة</h1>
          <p>إنشاء الحسابات وتحديد الصلاحيات وتفعيلها أو تعطيلها.</p>
        </div>
        <button className="primary-button" type="button" onClick={openCreate}>
          <Plus size={18} /> إضافة مستخدم
        </button>
      </div>

      <div className="user-summary-grid">
        <article><UsersRound size={21} /><div><strong>{summary.total}</strong><span>إجمالي المستخدمين</span></div></article>
        <article><UserCheck size={21} /><div><strong>{summary.active}</strong><span>حسابات مفعلة</span></div></article>
        <article><ShieldCheck size={21} /><div><strong>{summary.admins}</strong><span>مديرو النظام</span></div></article>
        <article><UserRoundCog size={21} /><div><strong>{summary.viewers}</strong><span>مشاهدون</span></div></article>
      </div>

      {error && <div className="form-error package-notice">{error}</div>}
      {notice && <div className="success-message package-notice"><CheckCircle2 size={17} />{notice}</div>}

      <div className="content-card users-card">
        <div className="users-toolbar">
          <label className="users-search">
            <Search size={18} />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="بحث بالاسم أو البريد"
            />
          </label>
          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
            <option value="all">كل الصلاحيات</option>
            <option value="super_admin">Super Admin</option>
            <option value="admin">Admin</option>
            <option value="viewer">Viewer</option>
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">كل الحالات</option>
            <option value="active">مفعّل</option>
            <option value="inactive">معطّل</option>
          </select>
        </div>

        {loading ? (
          <div className="table-loading"><LoaderCircle className="spin" size={25} /> جاري تحميل المستخدمين...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="empty-table"><strong>لا توجد نتائج</strong><span>غيّر البحث أو أضف مستخدمًا جديدًا.</span></div>
        ) : (
          <div className="responsive-table-wrap">
            <table className="admin-users-table">
              <thead>
                <tr>
                  <th>المستخدم</th>
                  <th>الصلاحية</th>
                  <th>الحالة</th>
                  <th>آخر دخول</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((item) => {
                  const isCurrent = item.id === user?.id;
                  return (
                    <tr key={item.id}>
                      <td>
                        <div className="user-identity-cell">
                          <span className="user-avatar">{(item.full_name || item.email || 'U').trim().charAt(0).toUpperCase()}</span>
                          <div>
                            <strong>{item.full_name || 'بدون اسم'} {isCurrent && <small>حسابك</small>}</strong>
                            <span lang="en" dir="ltr">{item.email}</span>
                          </div>
                        </div>
                      </td>
                      <td><span className={`role-badge role-${item.role}`}>{ROLE_LABELS[item.role] || item.role}</span></td>
                      <td><span className={`account-status ${item.is_active ? 'active' : 'inactive'}`}>{item.is_active ? 'مفعّل' : 'معطّل'}</span></td>
                      <td><span className="last-login-text">{formatDate(item.last_sign_in_at)}</span></td>
                      <td>
                        <div className="row-actions">
                          <button className="icon-button" type="button" title="تعديل" onClick={() => openEdit(item)}><Edit3 size={17} /></button>
                          <button
                            className="icon-button"
                            type="button"
                            title={item.is_active ? 'تعطيل' : 'تفعيل'}
                            onClick={() => toggleUser(item)}
                            disabled={busy || isCurrent}
                          >
                            {item.is_active ? <UserX size={17} /> : <UserCheck size={17} />}
                          </button>
                          <button
                            className="icon-button danger-icon"
                            type="button"
                            title="حذف"
                            onClick={() => setDeleteTarget(item)}
                            disabled={busy || isCurrent}
                          ><Trash2 size={17} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !busy) setModalOpen(false);
        }}>
          <section className="user-form-modal" role="dialog" aria-modal="true">
            <button className="icon-button modal-close" type="button" onClick={() => setModalOpen(false)} disabled={busy}><X size={19} /></button>
            <div className="user-modal-icon">{editing ? <Edit3 size={25} /> : <Plus size={25} />}</div>
            <h2>{editing ? 'تعديل المستخدم' : 'إضافة مستخدم جديد'}</h2>
            <p>{editing ? 'عدّل البيانات أو ضع كلمة مرور جديدة عند الحاجة.' : 'أنشئ حسابًا جديدًا وحدد الصلاحية المناسبة.'}</p>

            <form className="user-form" onSubmit={handleSubmit}>
              <div className="form-grid two-columns">
                <label>
                  الاسم الكامل
                  <input value={form.fullName} onChange={(event) => updateForm('fullName', event.target.value)} required />
                </label>
                <label>
                  البريد الإلكتروني
                  <input type="email" dir="ltr" value={form.email} onChange={(event) => updateForm('email', event.target.value)} required />
                </label>
                <label>
                  الصلاحية
                  <select value={form.role} onChange={(event) => updateForm('role', event.target.value)}>
                    <option value="viewer">Viewer — مشاهدة فقط</option>
                    <option value="admin">Admin — إدارة المحتوى</option>
                    <option value="super_admin">Super Admin — تحكم كامل</option>
                  </select>
                </label>
                <label>
                  {editing ? 'كلمة مرور جديدة (اختياري)' : 'كلمة المرور'}
                  <span className="field-with-leading-icon">
                    <KeyRound size={17} />
                    <input
                      type="password"
                      dir="ltr"
                      value={form.password}
                      onChange={(event) => updateForm('password', event.target.value)}
                      required={!editing}
                      minLength={editing && !form.password ? undefined : 8}
                      placeholder={editing ? 'اتركها فارغة دون تغيير' : '8 أحرف على الأقل'}
                    />
                  </span>
                </label>
              </div>
              <label className="active-account-switch">
                <input type="checkbox" checked={form.isActive} onChange={(event) => updateForm('isActive', event.target.checked)} />
                <span><strong>الحساب مفعّل</strong><small>يمكن للمستخدم تسجيل الدخول والوصول وفقًا لصلاحيته.</small></span>
              </label>
              {error && <div className="form-error">{error}</div>}
              <div className="modal-actions">
                <button className="secondary-button" type="button" onClick={() => setModalOpen(false)} disabled={busy}>إلغاء</button>
                <button className="primary-button" type="submit" disabled={busy}>
                  {busy ? <><LoaderCircle className="spin" size={17} /> جاري الحفظ...</> : editing ? 'حفظ التعديلات' : 'إنشاء المستخدم'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="حذف المستخدم"
        description={`سيتم حذف حساب ${deleteTarget?.full_name || deleteTarget?.email || ''} نهائيًا ولن يستطيع تسجيل الدخول.`}
        confirmLabel="حذف نهائي"
        busy={busy}
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteUser}
      />
    </section>
  );
}
