import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownAZ,
  Copy,
  ImagePlus,
  PlusCircle,
  RefreshCw,
  Search,
  Swords,
  Trophy,
  UserPlus,
  Users,
} from "lucide-react";
import Navbar from "../components/Navbar";
import PageHeader from "../components/PageHeader";
import { useIsLargeScreen } from "../hooks/useResponsive";
import { groupService } from "../services/api";
import { useAuthStore } from "../store/authStore";

type Group = {
  id: string;
  name: string;
  members_count?: number;
  description?: string;
  group_image_url?: string;
  routine_name?: string | null;
  creator_username?: string;
  creator_id?: string;
};

type JoinRequest = {
  id: string;
  user_id: string;
  username: string;
  created_at: string;
};
type GroupDetails = Group & {
  members?: Array<{ user_id: string; username: string; joined_at: string }>;
};
type Competition = {
  id: string;
  name: string;
  group_id_1: string;
  group_id_2: string;
  group_1_name: string;
  group_2_name: string;
};

type MobileView = "onboarding" | "groups" | "competitions" | "manage";

export default function Groups() {
  const warsInMaintenance = true;
  const isLargeScreen = useIsLargeScreen();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<GroupDetails | null>(null);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [groupForm, setGroupForm] = useState({
    name: "",
    description: "",
    groupImageUrl: "",
  });
  const [inviteUserId, setInviteUserId] = useState("");
  const [compForm, setCompForm] = useState({
    rivalGroupId: "",
    name: "",
    startDate: "",
    endDate: "",
  });
  const [scoresByCompetition, setScoresByCompetition] = useState<
    Record<string, string>
  >({});
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingCompetitions, setLoadingCompetitions] = useState(true);
  const [groupQuery, setGroupQuery] = useState("");
  const [competitionQuery, setCompetitionQuery] = useState("");
  const [sortAsc, setSortAsc] = useState(true);
  const [mobileView, setMobileView] = useState<MobileView>("onboarding");
  const [joinLookupId, setJoinLookupId] = useState("");
  const [joinLookupResult, setJoinLookupResult] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const hasGroups = groups.length > 0;

  useEffect(() => {
    if (!hasGroups) {
      setMobileView("onboarding");
      return;
    }
    if (mobileView === "onboarding") {
      setMobileView("groups");
    }
  }, [hasGroups, mobileView]);

  const loadGroups = async () => {
    setLoadingGroups(true);
    try {
      setError("");
      const response = await groupService.getGroups();
      const data = response.data.groups || [];
      setGroups(data);
      if (!selectedGroupId && data.length > 0) {
        setSelectedGroupId(data[0].id);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || "No se pudieron cargar grupos");
    } finally {
      setLoadingGroups(false);
    }
  };

  const loadJoinRequests = async (groupId: string) => {
    try {
      const response = await groupService.listJoinRequests(groupId);
      setJoinRequests(response.data.requests || []);
    } catch {
      setJoinRequests([]);
    }
  };

  useEffect(() => {
    if (
      selectedGroup &&
      currentUserId &&
      selectedGroup.creator_id === currentUserId
    ) {
      loadJoinRequests(selectedGroup.id);
    } else {
      setJoinRequests([]);
    }
  }, [selectedGroup, currentUserId]);

  const respondJoinRequest = async (
    requestId: string,
    action: "accepted" | "rejected",
  ) => {
    if (!selectedGroupId) return;
    try {
      await groupService.respondJoinRequest(selectedGroupId, requestId, action);
      await loadJoinRequests(selectedGroupId);
      await loadGroups();
      setStatusMessage(
        action === "accepted" ? "Solicitud aceptada" : "Solicitud rechazada",
      );
    } catch (err: any) {
      setError(
        err.response?.data?.error || "No se pudo responder la solicitud",
      );
    }
  };

  const loadCompetitions = async () => {
    setLoadingCompetitions(true);
    try {
      const response = await groupService.listMyCompetitions();
      setCompetitions(response.data.competitions || []);
    } finally {
      setLoadingCompetitions(false);
    }
  };

  useEffect(() => {
    loadGroups().catch(() => undefined);
    loadCompetitions().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!selectedGroupId) {
      setSelectedGroup(null);
      return;
    }
    groupService
      .getGroupById(selectedGroupId)
      .then((response) => setSelectedGroup(response.data.group))
      .catch(() => setSelectedGroup(null));
  }, [selectedGroupId]);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = window.setTimeout(() => setStatusMessage(""), 2600);
    return () => window.clearTimeout(timer);
  }, [statusMessage]);

  const createGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await groupService.createGroup(groupForm);
      setGroupForm({ name: "", description: "", groupImageUrl: "" });
      await loadGroups();
      setStatusMessage("Grupo creado correctamente");
      setMobileView("groups");
    } catch (err: any) {
      setError(err.response?.data?.error || "No se pudo crear grupo");
    }
  };

  const invite = async () => {
    if (!selectedGroupId || !inviteUserId) return;
    try {
      await groupService.inviteMember(selectedGroupId, inviteUserId);
      setInviteUserId("");
      setStatusMessage("Miembro agregado al grupo");
    } catch (err: any) {
      setError(err.response?.data?.error || "No se pudo invitar miembro");
    }
  };

  const createCompetition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroupId) return;
    if (
      compForm.startDate &&
      compForm.endDate &&
      compForm.endDate < compForm.startDate
    ) {
      setError("La fecha de fin no puede ser menor a la fecha de inicio");
      return;
    }
    try {
      await groupService.createCompetition(selectedGroupId, compForm);
      setCompForm({ rivalGroupId: "", name: "", startDate: "", endDate: "" });
      await loadCompetitions();
      setStatusMessage("Competencia creada");
      if (!isLargeScreen) setMobileView("competitions");
    } catch (err: any) {
      setError(err.response?.data?.error || "No se pudo crear competencia");
    }
  };

  const lookupGroup = async () => {
    if (!joinLookupId.trim()) return;
    try {
      const response = await groupService.lookupGroup(joinLookupId.trim());
      setJoinLookupResult({
        id: response.data.group.id,
        name: response.data.group.name,
      });
      setStatusMessage(
        "Grupo encontrado. Pide invitacion a un administrador de ese grupo.",
      );
    } catch {
      setJoinLookupResult(null);
      setStatusMessage("No se encontro grupo con ese ID");
    }
  };

  const showScore = async (competitionId: string) => {
    try {
      const response = await groupService.getCompetitionScore(competitionId);
      const score = response.data.score || [];
      const competition = competitions.find((c) => c.id === competitionId);
      const printable = score
        .map((s: any) => {
          const label = competition
            ? s.group_id === competition.group_id_1
              ? competition.group_1_name
              : s.group_id === competition.group_id_2
                ? competition.group_2_name
                : s.group_id
            : s.group_id;
          return `${label}: ${Number(s.total_volume).toFixed(2)} kg`;
        })
        .join(" | ");
      setScoresByCompetition((prev) => ({
        ...prev,
        [competitionId]: printable || "Sin puntaje aun",
      }));
    } catch {
      setScoresByCompetition((prev) => ({
        ...prev,
        [competitionId]: "No se pudo cargar puntaje",
      }));
    }
  };

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setStatusMessage(`${label} copiado`);
    } catch {
      setStatusMessage(`No se pudo copiar ${label}`);
    }
  };

  const visibleGroups = useMemo(
    () =>
      groups
        .filter((g) => g.name.toLowerCase().includes(groupQuery.toLowerCase()))
        .sort((a, b) =>
          sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name),
        ),
    [groups, groupQuery, sortAsc],
  );

  const visibleCompetitions = useMemo(
    () =>
      competitions
        .filter(
          (c) =>
            c.name.toLowerCase().includes(competitionQuery.toLowerCase()) ||
            c.group_1_name
              .toLowerCase()
              .includes(competitionQuery.toLowerCase()) ||
            c.group_2_name
              .toLowerCase()
              .includes(competitionQuery.toLowerCase()),
        )
        .sort((a, b) =>
          sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name),
        ),
    [competitions, competitionQuery, sortAsc],
  );

  const showGroupsPanel = isLargeScreen || mobileView === "groups";
  const showCompetitionsPanel = isLargeScreen || mobileView === "competitions";
  const showManagePanel = isLargeScreen || mobileView === "manage";

  return (
    <>
      <Navbar />
      <main id="main-content" className="page-shell">
        <PageHeader
          icon={<Swords className="title-icon" />}
          title="Grupos"
          subtitle="En móvil vas por pasos; en escritorio ves todo a la vez."
        />

        {error && <div className="mb-4 status-error">{error}</div>}
        {statusMessage && (
          <div className="mb-4 status-success">{statusMessage}</div>
        )}
        <div className="sr-only" aria-live="polite">
          {statusMessage}
        </div>

        <div className="kpi-strip mb-4">
          <span className="tiny-badge">Grupos: {groups.length}</span>
          <span className="tiny-badge">
            Competencias: {competitions.length}
          </span>
          <button
            className="btn-soft text-sm inline-flex items-center gap-1"
            onClick={loadGroups}
          >
            <RefreshCw size={14} />
            Refrescar grupos
          </button>
          <button
            className="btn-soft text-sm inline-flex items-center gap-1"
            onClick={loadCompetitions}
          >
            <RefreshCw size={14} />
            Refrescar guerras
          </button>
        </div>

        {!isLargeScreen && !hasGroups && (
          <div className="mobile-tabs mb-4">
            <button
              className={`mobile-tab ${mobileView === "onboarding" ? "active" : ""}`}
              onClick={() => setMobileView("onboarding")}
            >
              Crear / unirme
            </button>
          </div>
        )}

        {!isLargeScreen && hasGroups && (
          <div className="mobile-tabs mb-4">
            <button
              className={`mobile-tab ${mobileView === "groups" ? "active" : ""}`}
              onClick={() => setMobileView("groups")}
            >
              Mis grupos
            </button>
            <button
              className={`mobile-tab ${mobileView === "competitions" ? "active" : ""}`}
              onClick={() => setMobileView("competitions")}
            >
              Competencias
            </button>
            <button
              className={`mobile-tab ${mobileView === "manage" ? "active" : ""}`}
              onClick={() => setMobileView("manage")}
            >
              Gestion
            </button>
          </div>
        )}

        {!hasGroups ? (
          <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <article className="panel p-5 stack-gap">
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 inline-flex items-center gap-2">
                <PlusCircle size={20} />
                Nuevo grupo
              </h2>
              <form onSubmit={createGroup} className="space-y-2">
                <input
                  className="field"
                  placeholder="Nombre del grupo"
                  value={groupForm.name}
                  onChange={(e) =>
                    setGroupForm((s) => ({ ...s, name: e.target.value }))
                  }
                  required
                />
                <textarea
                  className="field"
                  placeholder="Descripcion"
                  value={groupForm.description}
                  onChange={(e) =>
                    setGroupForm((s) => ({ ...s, description: e.target.value }))
                  }
                />
                <input
                  className="field"
                  placeholder="URL de foto de grupo"
                  value={groupForm.groupImageUrl}
                  onChange={(e) =>
                    setGroupForm((s) => ({
                      ...s,
                      groupImageUrl: e.target.value,
                    }))
                  }
                />
                <button className="btn-primary inline-flex items-center gap-1">
                  <PlusCircle size={14} />
                  Crear ahora
                </button>
              </form>
            </article>

            <article className="panel p-5 stack-gap">
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 inline-flex items-center gap-2">
                <Users size={20} />
                Unirme
              </h2>
              <p className="soft-text">
                Si te comparten un ID de grupo, puedes localizarlo y pedir
                invitacion.
              </p>
              <div className="flex gap-2">
                <input
                  className="field"
                  value={joinLookupId}
                  onChange={(e) => setJoinLookupId(e.target.value)}
                  placeholder="Pega ID de grupo"
                />
                <button
                  className="btn-soft"
                  onClick={lookupGroup}
                  type="button"
                >
                  Buscar
                </button>
              </div>
              {joinLookupResult ? (
                <div className="status-info">
                  Grupo: <strong>{joinLookupResult.name}</strong>
                  <div className="mt-1">
                    <button
                      className="btn-soft text-sm"
                      onClick={() =>
                        copyText(joinLookupResult.id, "ID de grupo")
                      }
                      type="button"
                    >
                      Copiar ID
                    </button>
                  </div>
                </div>
              ) : (
                <div className="empty-state">
                  Cuando estes dentro de un grupo, aqui apareceran guerras e
                  invitaciones avanzadas.
                </div>
              )}
            </article>
          </section>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            {showGroupsPanel && (
              <section className="panel p-5 space-y-4 xl:col-span-4">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 inline-flex items-center gap-2">
                  <Users size={20} />
                  Mis grupos
                </h2>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search
                      size={14}
                      className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500"
                    />
                    <input
                      className="field !pl-7"
                      value={groupQuery}
                      onChange={(e) => setGroupQuery(e.target.value)}
                      placeholder="Filtrar grupos"
                    />
                  </div>
                  <button
                    className="btn-soft"
                    onClick={() => setSortAsc((v) => !v)}
                  >
                    <ArrowDownAZ size={14} />
                  </button>
                </div>
                {loadingGroups && (
                  <div className="soft-text inline-flex items-center gap-2">
                    <span className="loader" />
                    Cargando grupos...
                  </div>
                )}
                <div className="space-y-2">
                  {visibleGroups.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => setSelectedGroupId(g.id)}
                      className={`w-full text-left border rounded p-3 clickable-row ${selectedGroupId === g.id ? "border-sky-400 bg-sky-500/10" : "border-slate-500/30 dark:border-slate-700"}`}
                    >
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {g.name}
                      </div>
                      <div className="text-xs soft-text">
                        Miembros: {g.members_count || 0}
                      </div>
                      <div className="mt-2 flex gap-2">
                        <span className="tiny-badge">ID corto</span>
                        {!isLargeScreen && (
                          <span
                            className="tiny-badge"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMobileView("competitions");
                            }}
                          >
                            Ir a competir
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                  {visibleGroups.length === 0 && (
                    <div className="empty-state">
                      No hay grupos para ese filtro.
                    </div>
                  )}
                </div>
                {selectedGroupId && (
                  <button
                    type="button"
                    className="btn-soft text-sm inline-flex items-center gap-1"
                    onClick={() => copyText(selectedGroupId, "ID de grupo")}
                  >
                    <Copy size={14} />
                    Copiar ID del grupo seleccionado
                  </button>
                )}
                {selectedGroup && (
                  <div className="panel p-4 stack-gap">
                    <div className="flex items-start gap-3">
                      <div className="w-16 h-16 rounded-lg overflow-hidden border border-slate-400/30 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 shrink-0">
                        {selectedGroup.group_image_url ? (
                          <img
                            src={selectedGroup.group_image_url}
                            alt={selectedGroup.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-500">
                            <ImagePlus size={24} />
                          </div>
                        )}
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                          {selectedGroup.name}
                        </h3>
                        <div className="text-xs soft-text">
                          {selectedGroup.description || "Sin descripción"}
                        </div>
                        <div className="text-xs soft-text mt-1">
                          Creador:{" "}
                          {selectedGroup.creator_username || "Desconocido"}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="tiny-badge">
                        Miembros: {selectedGroup.members_count || 0}
                      </span>
                      {selectedGroup.routine_name && (
                        <span className="tiny-badge">
                          Rutina: {selectedGroup.routine_name}
                        </span>
                      )}
                    </div>
                    <div className="text-xs soft-text break-all">
                      ID: {selectedGroup.id}
                    </div>
                  </div>
                )}
              </section>
            )}

            {showCompetitionsPanel && (
              <section
                className={`panel p-5 space-y-4 xl:col-span-5 relative ${warsInMaintenance ? "opacity-60" : ""}`}
              >
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 inline-flex items-center gap-2">
                  <Swords size={20} />
                  Competencias
                </h2>
                {warsInMaintenance && (
                  <div className="status-warning">
                    Sistema de guerras en mantenimiento. Volverá pronto.
                  </div>
                )}
                <div className="relative">
                  <Search
                    size={14}
                    className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500"
                  />
                  <input
                    className="field !pl-7"
                    value={competitionQuery}
                    onChange={(e) => setCompetitionQuery(e.target.value)}
                    placeholder="Filtrar competencias"
                  />
                </div>
                {loadingCompetitions && (
                  <div className="soft-text inline-flex items-center gap-2">
                    <span className="loader" />
                    Cargando competencias...
                  </div>
                )}
                <div className="space-y-2 max-h-[62vh] overflow-auto pr-1">
                  {visibleCompetitions.map((c) => (
                    <div
                      key={c.id}
                      className="border border-slate-500/30 dark:border-slate-700 rounded p-3 bg-white/40 dark:bg-slate-900/35"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-slate-100">
                            {c.name}
                          </div>
                          <div className="text-sm soft-text">
                            {c.group_1_name} vs {c.group_2_name}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => showScore(c.id)}
                            className="btn-soft text-sm"
                            disabled={warsInMaintenance}
                          >
                            Ver score
                          </button>
                          <button
                            onClick={() => copyText(c.id, "ID de competencia")}
                            className="btn-soft text-sm inline-flex items-center gap-1"
                          >
                            <Copy size={14} />
                            Copiar
                          </button>
                        </div>
                      </div>
                      {scoresByCompetition[c.id] && (
                        <div className="mt-2 text-sm text-sky-700 dark:text-cyan-200 border border-cyan-400/30 rounded p-2 bg-cyan-600/10">
                          {scoresByCompetition[c.id]}
                        </div>
                      )}
                    </div>
                  ))}
                  {visibleCompetitions.length === 0 && (
                    <div className="empty-state">
                      No hay competencias para ese filtro.
                    </div>
                  )}
                </div>
              </section>
            )}

            {showManagePanel && (
              <section className="panel p-5 space-y-4 xl:col-span-3">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 inline-flex items-center gap-2">
                  <PlusCircle size={20} />
                  Gestion
                </h2>

                <form onSubmit={createGroup} className="space-y-2">
                  <label className="field-label">Nuevo grupo</label>
                  <input
                    className="field"
                    placeholder="Nombre del grupo"
                    value={groupForm.name}
                    onChange={(e) =>
                      setGroupForm((s) => ({ ...s, name: e.target.value }))
                    }
                    required
                  />
                  <textarea
                    className="field"
                    placeholder="Descripcion"
                    value={groupForm.description}
                    onChange={(e) =>
                      setGroupForm((s) => ({
                        ...s,
                        description: e.target.value,
                      }))
                    }
                  />
                  <input
                    className="field"
                    placeholder="URL de foto de grupo"
                    value={groupForm.groupImageUrl}
                    onChange={(e) =>
                      setGroupForm((s) => ({
                        ...s,
                        groupImageUrl: e.target.value,
                      }))
                    }
                  />
                  <button className="btn-primary w-full">Crear grupo</button>
                </form>

                <div className="stack-gap">
                  <label className="field-label inline-flex items-center gap-1">
                    <UserPlus size={14} />
                    Invitar por user ID
                  </label>
                  <div className="flex gap-2">
                    <input
                      className="field"
                      value={inviteUserId}
                      onChange={(e) => setInviteUserId(e.target.value)}
                      placeholder="UUID del amigo"
                    />
                    <button
                      onClick={invite}
                      className="btn-primary"
                      type="button"
                    >
                      Invitar
                    </button>
                  </div>
                </div>

                {selectedGroup?.creator_id === currentUserId &&
                  joinRequests.length > 0 && (
                    <div className="stack-gap">
                      <label className="field-label">
                        Solicitudes de ingreso pendientes
                      </label>
                      {joinRequests.map((r) => (
                        <div
                          key={r.id}
                          className="flex items-center justify-between border border-slate-400/30 dark:border-slate-700 rounded p-2"
                        >
                          <span className="text-sm text-slate-900 dark:text-slate-100">
                            {r.username}
                          </span>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="btn-soft text-xs"
                              onClick={() =>
                                respondJoinRequest(r.id, "accepted")
                              }
                            >
                              Aceptar
                            </button>
                            <button
                              type="button"
                              className="btn-soft text-xs"
                              onClick={() =>
                                respondJoinRequest(r.id, "rejected")
                              }
                            >
                              Rechazar
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                <form
                  onSubmit={createCompetition}
                  className={`stack-gap ${warsInMaintenance ? "opacity-60" : ""}`}
                >
                  <label className="field-label inline-flex items-center gap-1">
                    <Trophy size={14} />
                    Crear guerra
                  </label>
                  <input
                    className="field"
                    value={compForm.name}
                    onChange={(e) =>
                      setCompForm((s) => ({ ...s, name: e.target.value }))
                    }
                    placeholder="Nombre de la guerra"
                    required
                  />
                  <select
                    className="field"
                    value={compForm.rivalGroupId}
                    onChange={(e) =>
                      setCompForm((s) => ({
                        ...s,
                        rivalGroupId: e.target.value,
                      }))
                    }
                    required
                  >
                    <option value="">Selecciona grupo rival</option>
                    {groups
                      .filter((g) => g.id !== selectedGroupId)
                      .map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                  </select>
                  <input
                    type="date"
                    className="field"
                    value={compForm.startDate}
                    onChange={(e) =>
                      setCompForm((s) => ({ ...s, startDate: e.target.value }))
                    }
                  />
                  <input
                    type="date"
                    className="field"
                    value={compForm.endDate}
                    onChange={(e) =>
                      setCompForm((s) => ({ ...s, endDate: e.target.value }))
                    }
                  />
                  <button
                    className="btn-primary w-full"
                    disabled={warsInMaintenance}
                  >
                    Crear competencia
                  </button>
                </form>
                {warsInMaintenance && (
                  <div className="status-info">
                    Creación de guerras deshabilitada temporalmente por
                    mantenimiento.
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </main>
    </>
  );
}
