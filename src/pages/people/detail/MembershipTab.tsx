import { Badge, Icon, Link, Select, Text } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../components/form/DataTable';
import { MasterLookup } from '../../../components/form/MasterLookup';
import { TEAM_ROLES, type TeamRole } from '../../../mocks/peopleMasters';
import type { EmployeeRole, EmployeeTeam } from '../../../mocks/employees';
import { employeeRoleDef, teamDef } from '../../settings/masterDefs';
import type { TabProps } from './types';

type RoleRow = EmployeeRole & { n: number };
type TeamRow = EmployeeTeam & { n: number };

/** The roles an employee holds (one is the default) and the teams they're on. */
export function MembershipTab({ draft, update, errors }: TabProps) {
  const roles: RoleRow[] = draft.roles.map((r, n) => ({ ...r, n }));
  const teams: TeamRow[] = draft.teams.map((t, n) => ({ ...t, n }));

  const setRole = (n: number, roleId: string) => {
    const was = draft.roles[n].roleId;
    update({
      roles: draft.roles.map((r, i) => (i === n ? { roleId } : r)),
      // The default follows its row when the row's role is changed.
      ...(was && was === draft.defaultRoleId ? { defaultRoleId: roleId } : {}),
    });
  };
  const removeRoles = (picked: RoleRow[]) => {
    const left = draft.roles.filter((_, i) => !picked.some((p) => p.n === i));
    update({ roles: left, defaultRoleId: left.some((r) => r.roleId === draft.defaultRoleId) ? draft.defaultRoleId : (left[0]?.roleId ?? '') });
  };
  const setTeam = (n: number, patch: Partial<EmployeeTeam>) => update({ teams: draft.teams.map((t, i) => (i === n ? { ...t, ...patch } : t)) });
  const takenRoles = (n: number) => draft.roles.filter((_, i) => i !== n).map((r) => r.roleId);
  const takenTeams = (n: number) => draft.teams.filter((_, i) => i !== n).map((t) => t.teamId);

  return (
    <>
      <DataTable<RoleRow>
        variant="card"
        icon="assignment_ind"
        title="Roles"
        description={
          <>
            Roles the employee holds. The default role is the one documents and approvals use first.
            {errors.roles ? <Text variant="small" tone="danger">{errors.roles}</Text> : null}
          </>
        }
        actions={
          <Link leadingIcon={<Icon size={20}>add</Icon>} onClick={() => update({ roles: [...draft.roles, { roleId: '' }], defaultRoleId: draft.defaultRoleId || '' })}>
            Add role
          </Link>
        }
        rows={roles}
        getRowId={(r) => `role:${r.n}`}
        noPagination
        unsortable={['roleId', 'default']}
        onRemove={removeRoles}
        empty={<Text variant="small" tone="muted">No roles yet.</Text>}
        columns={[
          {
            key: 'roleId',
            header: 'Role',
            cell: (r) => (
              <div className="w-64">
                <MasterLookup
                  def={employeeRoleDef}
                  fieldProps={{ 'aria-label': `Role ${r.n + 1}` }}
                  value={r.roleId}
                  onChange={(v) => setRole(r.n, v)}
                  where={(row) => !takenRoles(r.n).includes(row.id)}
                  placeholder="Pick a role"
                />
              </div>
            ),
          },
          {
            key: 'default',
            header: 'Default',
            cell: (r) =>
              r.roleId && r.roleId === draft.defaultRoleId ? (
                <Badge size="small" intent="primary">Default</Badge>
              ) : r.roleId ? (
                <Link onClick={() => update({ defaultRoleId: r.roleId })}>Set as default</Link>
              ) : null,
          },
        ]}
      />

      <DataTable<TeamRow>
        variant="card"
        icon="groups"
        title="Teams"
        description={
          <>
            Cross-functional teams the employee is on, and their part in each.
            {errors.teams ? <Text variant="small" tone="danger">{errors.teams}</Text> : null}
          </>
        }
        actions={
          <Link leadingIcon={<Icon size={20}>add</Icon>} onClick={() => update({ teams: [...draft.teams, { teamId: '', teamRole: 'Member' }] })}>
            Add team
          </Link>
        }
        rows={teams}
        getRowId={(t) => `team:${t.n}`}
        noPagination
        unsortable={['teamId', 'teamRole']}
        onRemove={(picked) => update({ teams: draft.teams.filter((_, i) => !picked.some((p) => p.n === i)) })}
        empty={<Text variant="small" tone="muted">Not on any team.</Text>}
        columns={[
          {
            key: 'teamId',
            header: 'Team',
            cell: (t) => (
              <div className="w-64">
                <MasterLookup
                  def={teamDef}
                  fieldProps={{ 'aria-label': `Team ${t.n + 1}` }}
                  value={t.teamId}
                  onChange={(v) => setTeam(t.n, { teamId: v })}
                  where={(row) => !takenTeams(t.n).includes(row.id)}
                  placeholder="Pick a team"
                />
              </div>
            ),
          },
          {
            key: 'teamRole',
            header: 'Team role',
            cell: (t) => (
              <div className="w-40">
                <Select
                  aria-label={`Team role ${t.n + 1}`}
                  options={TEAM_ROLES.map((r) => ({ value: r, label: r }))}
                  value={t.teamRole}
                  onValueChange={(v) => setTeam(t.n, { teamRole: v as TeamRole })}
                />
              </div>
            ),
          },
        ]}
      />
    </>
  );
}
