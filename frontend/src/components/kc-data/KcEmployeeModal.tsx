import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./KcEmployeeModal.css";
import {
  KC_CITY_OPTIONS,
  KC_COMPANY_OPTIONS,
  KC_LINE_OPTIONS,
  normalizeKcCityValue,
  normalizeKcCompanyValue,
  normalizeKcLineValue,
} from "../../lib/kcFieldOptions";
import {
  KC_EDIT_FIELDS,
  createKcEmployee,
  formatKcFieldDisplay,
  updateKcEmployee,
  uploadKcEmployeePhoto,
  type KcEmployeeEdit,
  type KcEmployeeRecord,
  type KcFieldLabel,
} from "../../lib/kcData";
import {
  normalizeCareerSteps,
  parseCareerPathFromEmployee,
  type CareerStep,
} from "../../lib/kcCareerPath";
import { kcBackofficeClientUrl } from "../../lib/kcBackoffice";
import { normalizeKcFieldValue } from "../../lib/kcFormat";
import { KcCareerMap } from "./KcCareerMap";
import { KcMessengerLinks } from "./KcMessengerLinks";
import { KcSelectInput } from "./KcSelectInput";
import { KcSuggestInput } from "./KcSuggestInput";
import { kcFieldInputClass } from "./kcFieldStyles";

const panelSurface =
  "rounded-[20px] border border-white/[0.08] bg-gradient-to-br from-[rgba(6,11,38,0.96)] to-[rgba(26,31,55,0.96)] backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_24px_64px_rgba(0,0,0,0.45)]";

const inputClass = kcFieldInputClass;

type Props = {
  employee: KcEmployeeRecord | null;
  fieldLabels: KcFieldLabel[];
  open: boolean;
  createMode?: boolean;
  canEdit: boolean;
  departmentHints: string[];
  subdivisionHints: string[];
  onClose: () => void;
  onSaved: (employee: KcEmployeeRecord) => void;
  /** Поверх других модалок (например, состав группы на карте структуры). */
  overlayZClass?: string;
};

const noPhotoPlaceholder = (
  <span className="flex h-full w-full items-center justify-center rounded-2xl border border-dashed border-white/15 bg-black/30 text-xs font-medium text-white/40">
    Нет фото
  </span>
);

function emptyEdit(): KcEmployeeEdit {
  return {
    department: "",
    subdivision: "",
    line: "",
    company: "",
    city: "",
    fullName: "",
    position: "",
    gradeNew: "",
    emailNew: "",
    phone: "",
    residenceAddress: "",
    telegramUsername: "",
    expressId: "",
    accountNumber: "",
    accountNumberExtra: "",
    telegramId: "",
    onMaternityLeave: false,
    isDismissed: false,
    birthDate: "",
    firstWorkDay: "",
    accessDate: "",
    photoUrl: "",
    careerPath: [],
    extraData: {},
  };
}

function buildEditFromEmployee(employee: KcEmployeeRecord): KcEmployeeEdit {
  const d = employee.data;
  const extraFromEdit = employee.edit?.extraData ?? {};
  const extraFromData: Record<string, string> = {};
  for (const [k, v] of Object.entries(d)) {
    if (k.startsWith("cf_")) extraFromData[k] = v;
  }
  return {
    department: employee.department,
    subdivision: d.subdivision ?? employee.edit?.subdivision ?? "",
    line: normalizeKcLineValue(d.line ?? employee.edit?.line ?? ""),
    company: normalizeKcCompanyValue(d.company ?? employee.edit?.company ?? ""),
    city: normalizeKcCityValue(d.city ?? employee.edit?.city ?? ""),
    fullName: d.fullName ?? employee.edit?.fullName ?? "",
    position: d.position ?? employee.edit?.position ?? "",
    gradeNew: d.gradeNew ?? employee.edit?.gradeNew ?? "",
    emailNew: d.emailNew ?? employee.edit?.emailNew ?? "",
    phone: d.phone ?? employee.edit?.phone ?? "",
    residenceAddress: d.residenceAddress ?? employee.edit?.residenceAddress ?? "",
    telegramUsername: d.telegramUsername ?? employee.edit?.telegramUsername ?? "",
    expressId: d.expressId ?? employee.edit?.expressId ?? "",
    accountNumber: normalizeKcFieldValue("accountNumber", d.accountNumber ?? employee.edit?.accountNumber ?? ""),
    accountNumberExtra: normalizeKcFieldValue(
      "accountNumberExtra",
      d.accountNumberExtra ?? employee.edit?.accountNumberExtra ?? "",
    ),
    telegramId: normalizeKcFieldValue("telegramId", d.telegramId ?? employee.edit?.telegramId ?? ""),
    onMaternityLeave: Boolean(employee.onMaternityLeave ?? employee.edit?.onMaternityLeave),
    isDismissed: Boolean(employee.isDismissed ?? employee.edit?.isDismissed),
    birthDate: normalizeKcFieldValue("birthDate", d.birthDate ?? employee.edit?.birthDate ?? ""),
    firstWorkDay: normalizeKcFieldValue("firstWorkDay", d.firstWorkDay ?? employee.edit?.firstWorkDay ?? ""),
    accessDate: normalizeKcFieldValue("accessDate", d.accessDate ?? employee.edit?.accessDate ?? ""),
    photoUrl: employee.photoUrl ?? employee.edit?.photoUrl ?? "",
    careerPath: parseCareerPathFromEmployee(
      employee.careerPath ?? employee.edit?.careerPath,
      d.leaveOrTransferDate,
    ),
    extraData: { ...extraFromData, ...extraFromEdit },
  };
}

function renderEditControl(
  field: (typeof KC_EDIT_FIELDS)[number],
  form: KcEmployeeEdit,
  patch: (field: keyof KcEmployeeEdit, value: string) => void,
  departmentHints: string[],
  subdivisionHints: string[],
) {
  if (field.kind === "suggest-department") {
    return (
      <KcSuggestInput
        value={form.department}
        onChange={(v) => patch("department", v)}
        suggestions={departmentHints}
        placeholder="Служба поддержки"
      />
    );
  }
  if (field.kind === "suggest-subdivision") {
    return (
      <KcSuggestInput
        value={form.subdivision}
        onChange={(v) => patch("subdivision", v)}
        suggestions={subdivisionHints}
        placeholder="VIP-линия"
      />
    );
  }
  if (field.kind === "select-line") {
    return (
      <KcSelectInput value={form.line} onChange={(v) => patch("line", v)} options={KC_LINE_OPTIONS} />
    );
  }
  if (field.kind === "select-company") {
    return (
      <KcSelectInput value={form.company} onChange={(v) => patch("company", v)} options={KC_COMPANY_OPTIONS} />
    );
  }
  if (field.kind === "select-city") {
    return (
      <KcSelectInput value={form.city} onChange={(v) => patch("city", v)} options={KC_CITY_OPTIONS} />
    );
  }
  return (
    <input
      className={inputClass}
      value={form[field.key] as string}
      onChange={(e) => patch(field.key, e.target.value)}
    />
  );
}

export function KcEmployeeModal(props: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [editMode, setEditMode] = useState(false);
  const [careerEditMode, setCareerEditMode] = useState(false);
  const [form, setForm] = useState<KcEmployeeEdit>(emptyEdit());
  const [photoPreview, setPhotoPreview] = useState("");
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isCreate = Boolean(props.createMode);
  const showEditForm = isCreate || editMode;

  const customFields = props.fieldLabels.filter((f) => f.custom);
  const showCareerMap = props.fieldLabels.some((f) => f.key === "careerPath");
  const detailFields = props.fieldLabels.filter(
    (f) => f.key !== "careerPath" && f.key !== "subdivision" && !f.custom,
  );

  useEffect(() => {
    if (!props.open) return;
    setCareerEditMode(false);
    setError("");
    setPendingPhotoFile(null);
    if (isCreate) {
      setEditMode(true);
      setForm(emptyEdit());
      setPhotoPreview("");
      return;
    }
    if (!props.employee) return;
    setEditMode(false);
    const base: KcEmployeeEdit = props.employee.edit
      ? {
          ...emptyEdit(),
          ...props.employee.edit,
          extraData: { ...props.employee.edit.extraData },
          careerPath:
            props.employee.edit.careerPath ??
            parseCareerPathFromEmployee(props.employee.careerPath),
        }
      : buildEditFromEmployee(props.employee);
    setForm(base);
    setPhotoPreview(props.employee.photoUrl ?? "");
  }, [props.open, props.employee, isCreate]);

  if (!props.open) return null;
  if (!isCreate && !props.employee) return null;

  const name = props.employee?.data.fullName ?? form.fullName ?? "Сотрудник";
  const showMaternityBadge = Boolean(
    showEditForm ? form.onMaternityLeave : props.employee?.onMaternityLeave,
  );
  const showDismissedState = Boolean(showEditForm ? form.isDismissed : props.employee?.isDismissed);
  const photoInactiveClass = showDismissedState ? " kc-employee-modal__photo--inactive" : "";

  function renderAccountValue(fieldKey: "accountNumber" | "accountNumberExtra", raw: string) {
    const display = formatKcFieldDisplay(fieldKey, raw);
    if (display === "—") return display;
    const href = kcBackofficeClientUrl(raw);
    if (!href) return display;
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="kc-employee-modal__account-link">
        {display}
      </a>
    );
  }

  function patch(field: keyof KcEmployeeEdit, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function patchExtra(fieldKey: string, value: string) {
    setForm((f) => ({
      ...f,
      extraData: { ...f.extraData, [fieldKey]: value },
    }));
  }

  function patchCareer(steps: CareerStep[]) {
    setForm((f) => ({ ...f, careerPath: steps }));
  }

  function buildPayload(): KcEmployeeEdit {
    const urlFromPreview =
      photoPreview.startsWith("blob:") || photoPreview.startsWith("data:")
        ? form.photoUrl
        : photoPreview;
    return {
      ...form,
      photoUrl: urlFromPreview,
      accountNumber: normalizeKcFieldValue("accountNumber", form.accountNumber),
      accountNumberExtra: normalizeKcFieldValue("accountNumberExtra", form.accountNumberExtra),
      telegramId: normalizeKcFieldValue("telegramId", form.telegramId),
      onMaternityLeave: form.onMaternityLeave,
      isDismissed: form.isDismissed,
      birthDate: normalizeKcFieldValue("birthDate", form.birthDate),
      firstWorkDay: normalizeKcFieldValue("firstWorkDay", form.firstWorkDay),
      accessDate: normalizeKcFieldValue("accessDate", form.accessDate),
      careerPath: normalizeCareerSteps(form.careerPath),
    };
  }

  async function handleSave(closeCareerOnly = false) {
    setSaving(true);
    setError("");
    try {
      const payload = buildPayload();
      if (isCreate) {
        if (!payload.fullName.trim()) {
          throw new Error("Укажите ФИО");
        }
        let created = await createKcEmployee(payload);
        if (pendingPhotoFile) {
          const url = await uploadKcEmployeePhoto(created.id, pendingPhotoFile);
          created = { ...created, photoUrl: url };
        }
        props.onSaved(created);
        return;
      }
      if (!props.employee) return;
      const updated = await updateKcEmployee(props.employee.id, payload);
      props.onSaved(updated);
      setEditMode(false);
      if (closeCareerOnly) setCareerEditMode(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handlePhotoFile(file: File) {
    if (isCreate) {
      setPendingPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (!props.employee) return;
    setSaving(true);
    setError("");
    try {
      const url = await uploadKcEmployeePhoto(props.employee.id, file);
      setPhotoPreview(url);
      patch("photoUrl", url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const rootClass = ["kc-employee-modal__root", props.overlayZClass].filter(Boolean).join(" ");
  const careerStepsForScroll = showEditForm
    ? form.careerPath.length
    : careerEditMode
      ? form.careerPath.length
      : parseCareerPathFromEmployee(
          props.employee?.careerPath,
          props.employee?.data.leaveOrTransferDate,
        ).length;
  const careerScrollable = showCareerMap && careerStepsForScroll > 0;

  return createPortal(
    <div className={rootClass} role="presentation">
      <div className="kc-employee-modal__backdrop" aria-hidden onClick={props.onClose} />
      <div className="kc-employee-modal__layer" onClick={props.onClose}>
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="kc-employee-title"
          className={`kc-employee-modal__dialog max-w-[min(56rem,calc(100vw-2rem))] p-5 sm:p-6 ${panelSurface}`}
          onClick={(e) => e.stopPropagation()}
        >
        <div className="flex shrink-0 items-start justify-between gap-3">
          <h2 id="kc-employee-title" className="text-lg font-semibold text-white">
            {isCreate ? (
              "Новый сотрудник"
            ) : (
              <span className="kc-employee-modal__title-row">
                <span>{showEditForm ? "Редактирование" : name}</span>
                {showMaternityBadge ? (
                  <span className="kc-employee-modal__badge" title="В декрете" aria-label="В декрете">
                    🍼
                  </span>
                ) : null}
                {showDismissedState ? (
                  <span className="kc-employee-modal__badge kc-employee-modal__badge--dismissed">Уволен</span>
                ) : null}
              </span>
            )}
          </h2>
          <div className="flex shrink-0 gap-2">
            {props.canEdit && !showEditForm ? (
              <button
                type="button"
                className="rounded-lg border border-pari-500/40 bg-pari-500/20 px-3 py-1 text-xs font-medium text-white hover:bg-pari-500/30"
                onClick={() => setEditMode(true)}
              >
                Редактировать
              </button>
            ) : null}
            <button
              type="button"
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/70 hover:bg-white/10"
              onClick={props.onClose}
            >
              Закрыть
            </button>
          </div>
        </div>

        {error ? <p className="mt-3 shrink-0 text-sm text-red-300">{error}</p> : null}

        <div className="kc-employee-modal__scroll px-0.5">
          {showEditForm ? (
            <div className="space-y-4">
              <div className="space-y-4">
              <section className="rounded-xl border border-white/[0.08] bg-black/20 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-white/45">Фотография</p>
                {isCreate && pendingPhotoFile ? (
                  <p className="mt-1 text-[11px] text-white/40">Файл будет загружен при нажатии «Создать».</p>
                ) : null}
                <div className="mt-3 flex flex-wrap items-start gap-4">
                  {photoPreview ? (
                    <img
                      src={photoPreview}
                      alt=""
                      className={`h-24 w-24 rounded-2xl object-cover ring-2 ring-pari-500/30${photoInactiveClass}`}
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="h-24 w-24">{noPhotoPlaceholder}</div>
                  )}
                  <div className="min-w-0 flex-1 space-y-2">
                    <button
                      type="button"
                      className="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/15"
                      disabled={saving}
                      onClick={() => fileRef.current?.click()}
                    >
                      Загрузить фото
                    </button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handlePhotoFile(f);
                      }}
                    />
                    <label className="block text-xs text-white/50">
                      или ссылка на фото
                      <input
                        className={inputClass}
                        value={form.photoUrl}
                        onChange={(e) => {
                          patch("photoUrl", e.target.value);
                          setPhotoPreview(e.target.value);
                        }}
                        placeholder="https://…"
                      />
                    </label>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-white/[0.08] bg-black/20 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-white/45">Статус</p>
                <div className="mt-3 flex flex-wrap gap-4">
                  <label className="kc-firm-check">
                    <input
                      type="checkbox"
                      checked={form.onMaternityLeave}
                      onChange={(e) => patch("onMaternityLeave", e.target.checked)}
                    />
                    <span className="kc-firm-check__box" aria-hidden />
                    <span className="kc-firm-check__label">
                      <span className="kc-firm-check__icon" aria-hidden>
                        🍼
                      </span>
                      В декрете
                    </span>
                  </label>
                  <label className="kc-firm-check">
                    <input
                      type="checkbox"
                      checked={form.isDismissed}
                      onChange={(e) => patch("isDismissed", e.target.checked)}
                    />
                    <span className="kc-firm-check__box" aria-hidden />
                    <span className="kc-firm-check__label">Уволен</span>
                  </label>
                </div>
              </section>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {KC_EDIT_FIELDS.map((field) => (
                  <label key={field.key} className="block text-xs text-white/50">
                    {field.label}
                    {renderEditControl(field, form, patch, props.departmentHints, props.subdivisionHints)}
                  </label>
                ))}
                {customFields.map((field) => (
                  <label key={field.key} className="block text-xs text-white/50">
                    {field.label}
                    <input
                      className={inputClass}
                      value={form.extraData[field.key] ?? ""}
                      onChange={(e) => patchExtra(field.key, e.target.value)}
                    />
                  </label>
                ))}
              </div>
              </div>

              {showCareerMap ? (
                <div className={careerScrollable ? "kc-employee-modal__career-scroll" : "mt-4 shrink-0"}>
                  <KcCareerMap
                    steps={form.careerPath}
                    editMode
                    onChange={patchCareer}
                    departmentHints={props.departmentHints}
                    subdivisionHints={props.subdivisionHints}
                  />
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-4">
                {photoPreview || props.employee?.photoUrl ? (
                  <img
                    src={photoPreview || props.employee?.photoUrl}
                    alt=""
                    className={`h-20 w-20 shrink-0 rounded-2xl object-cover ring-2 ring-pari-500/30${photoInactiveClass}`}
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="h-20 w-20 shrink-0">{noPhotoPlaceholder}</div>
                )}
                <div>
                  <p className="text-sm text-white/55">{props.employee?.department}</p>
                  <KcMessengerLinks
                    telegramUsername={props.employee?.data.telegramUsername}
                    expressId={props.employee?.data.expressId}
                    email={props.employee?.data.emailNew}
                  />
                </div>
              </div>

              <dl className="space-y-3">
                {detailFields.map((field) => {
                  const raw = props.employee?.data[field.key]?.trim() || "";
                  const display = formatKcFieldDisplay(field.key, raw);
                  if (display === "—") return null;
                  const isAccount =
                    field.key === "accountNumber" || field.key === "accountNumberExtra";
                  return (
                    <div
                      key={field.key}
                      className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2.5"
                    >
                      <dt className="text-[10px] font-medium uppercase tracking-wide text-white/40">
                        {field.label}
                      </dt>
                      <dd className="mt-1 break-words text-sm font-medium text-white/90">
                        {isAccount
                          ? renderAccountValue(field.key as "accountNumber" | "accountNumberExtra", raw)
                          : display}
                      </dd>
                    </div>
                  );
                })}
              </dl>

              {showCareerMap ? (
                <div
                  className={`mt-4 space-y-3 ${careerScrollable ? "kc-employee-modal__career-scroll" : ""}`}
                >
                  {careerEditMode ? (
                    <>
                      <KcCareerMap
                        steps={form.careerPath}
                        editMode
                        onChange={patchCareer}
                        departmentHints={props.departmentHints}
                        subdivisionHints={props.subdivisionHints}
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-xl border border-pari-500/40 bg-pari-500/25 px-3 py-1.5 text-xs font-medium text-white hover:bg-pari-500/35 disabled:opacity-50"
                          disabled={saving}
                          onClick={() => void handleSave(true)}
                        >
                          {saving ? "Сохранение…" : "Сохранить этапы"}
                        </button>
                        <button
                          type="button"
                          className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
                          disabled={saving}
                          onClick={() => {
                            setCareerEditMode(false);
                            if (props.employee) {
                              const base = buildEditFromEmployee(props.employee);
                              setForm((f) => ({ ...f, careerPath: base.careerPath }));
                            }
                          }}
                        >
                          Отмена
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <KcCareerMap
                        steps={parseCareerPathFromEmployee(
                          props.employee?.careerPath,
                          props.employee?.data.leaveOrTransferDate,
                        )}
                      />
                      {props.canEdit ? (
                        <button
                          type="button"
                          className="rounded-lg border border-pari-500/35 bg-pari-500/15 px-3 py-1 text-xs font-medium text-pari-200 hover:bg-pari-500/25"
                          onClick={() => {
                            setCareerEditMode(true);
                            if (props.employee) setForm(buildEditFromEmployee(props.employee));
                          }}
                        >
                          Редактировать этапы
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}
            </>
          )}
        </div>

        {showEditForm ? (
          <div className="kc-employee-modal__footer flex flex-wrap gap-3">
            <button
              type="button"
              className="rounded-xl border border-pari-500/40 bg-pari-500/25 px-4 py-2 text-sm font-medium text-white hover:bg-pari-500/35 disabled:opacity-50"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? "Сохранение…" : isCreate ? "Создать" : "Сохранить"}
            </button>
            <button
              type="button"
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
              disabled={saving}
              onClick={() => {
                if (isCreate) {
                  props.onClose();
                  return;
                }
                setEditMode(false);
                setCareerEditMode(false);
                setError("");
                if (props.employee) {
                  setForm(buildEditFromEmployee(props.employee));
                  setPhotoPreview(props.employee.photoUrl);
                }
              }}
            >
              Отмена
            </button>
          </div>
        ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
