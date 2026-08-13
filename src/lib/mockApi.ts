import { UserProfile } from "@/lib/auth";

export const MOCK_TEAMS = [
  { id: 1, name: "AI", memberCount: 4 },
  { id: 2, name: "Business Architecture", memberCount: 3 },
  { id: 3, name: "Data", memberCount: 5 },
  { id: 4, name: "Enterprise Architecture", memberCount: 3 },
  { id: 5, name: "Privacy", memberCount: 4 },
  { id: 6, name: "PVM", memberCount: 6 },
  { id: 7, name: "Risk", memberCount: 4 },
  { id: 8, name: "Security Architecture", memberCount: 5 },
  { id: 9, name: "Security Governance", memberCount: 3 },
];

let nextId = 100;

export function mockGetTeams() {
  return Promise.resolve(MOCK_TEAMS);
}

export function mockJoinTeam(user: UserProfile, teamId: number): Promise<UserProfile> {
  const team = MOCK_TEAMS.find((t) => t.id === teamId);
  if (!team) return Promise.reject(new Error("Team not found"));
  return Promise.resolve({ ...user, team });
}
