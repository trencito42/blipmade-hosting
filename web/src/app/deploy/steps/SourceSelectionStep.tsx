import { useState, type ReactNode } from 'react';
import { get, post } from '../../../lib/api';
import { useAction } from '../../../lib/useAsync';
import { LoadingBlock, SoftButton, TextInput } from '../../../ui-app';
import { Icon } from '../../../icons';

export interface SourceInspectionResult {
  productSlug: string | null;
  runtime: string | null;
  confidence: 'confirmed' | 'likely' | 'unknown';
  start: string | null;
  build?: string | null;
  files: string[];
  notes: string[];
  services?: { slug: string; reason: string; certainty?: string; linkable?: boolean; billable?: boolean }[];
  importSourceId?: string;
}

interface SourceSelectionStepProps {
  sourceType: 'blank' | 'git' | 'github' | 'zip';
  onSourceTypeChange: (type: 'blank' | 'git' | 'github' | 'zip') => void;
  gitUrl: string;
  onGitUrlChange: (url: string) => void;
  inspection: SourceInspectionResult | null;
  onInspectionComplete: (result: SourceInspectionResult | null) => void;
  importSourceId?: string;
  onImportSourceIdChange?: (id: string | undefined) => void;
}

export function SourceSelectionStep({
  sourceType,
  onSourceTypeChange,
  gitUrl,
  onGitUrlChange,
  inspection,
  onInspectionComplete,
  importSourceId,
  onImportSourceIdChange,
}: SourceSelectionStepProps) {
  const [zipError, setZipError] = useState<string | null>(null);
  const [zipName, setZipName] = useState<string | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [githubRepos, setGithubRepos] = useState<
    { installationId: string; repositoryId: string; fullName: string; defaultBranch: string; isPrivate: boolean }[]
  >([]);
  const [selectedGithubRepo, setSelectedGithubRepo] = useState<string>('');

  const inspectGit = async () => {
    if (!gitUrl.trim()) return;
    setInspecting(true);
    try {
      const answer = await post<{ proposal: SourceInspectionResult }>('/catalog/import/inspect', {
        url: gitUrl.trim(),
      });
      // Plan it to get stored import source
      const plan = await post<{ plan: { id: string } }>('/catalog/import/plans', {
        url: gitUrl.trim(),
        confirmServices: [],
      });
      onImportSourceIdChange?.(plan.plan.id);
      onInspectionComplete({ ...answer.proposal, importSourceId: plan.plan.id });
    } catch (err: unknown) {
      onInspectionComplete(null);
      setZipError(err instanceof Error ? err.message : 'Could not inspect repository.');
    } finally {
      setInspecting(false);
    }
  };

  const loadGithub = async () => {
    try {
      const answer = await get<{ repositories: typeof githubRepos }>('/integrations/github/repositories');
      setGithubRepos(answer.repositories);
    } catch {
      setGithubRepos([]);
    }
  };

  const handleZipUpload = async (file: File) => {
    if (file.size > 8 * 1024 * 1024) {
      setZipError('The ZIP archive must be at most 8 MB.');
      return;
    }
    setZipError(null);
    setZipName(file.name);
    setInspecting(true);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
      const base64 = btoa(binary);

      const answer = await post<{ proposal: SourceInspectionResult }>('/catalog/import/inspect/zip', {
        name: file.name,
        base64,
      });

      const plan = await post<{ plan: { id: string } }>('/catalog/import/plans/zip', {
        name: file.name,
        base64,
        confirmServices: [],
      });

      onImportSourceIdChange?.(plan.plan.id);
      onInspectionComplete({ ...answer.proposal, importSourceId: plan.plan.id });
    } catch (err: unknown) {
      setZipError(err instanceof Error ? err.message : 'Failed to inspect ZIP archive.');
      onInspectionComplete(null);
    } finally {
      setInspecting(false);
    }
  };

  return (
    <div className="grid gap-6">
      {/* Source selector buttons */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { type: 'blank', label: 'Blank / New', icon: 'box', desc: 'Empty starter environment' },
          { type: 'git', label: 'Git URL', icon: 'code', desc: 'Public repository URL' },
          { type: 'github', label: 'GitHub App', icon: 'term', desc: 'Select authorized repo' },
          { type: 'zip', label: 'ZIP Archive', icon: 'restart', desc: 'Upload code archive' },
        ].map((tab) => {
          const active = sourceType === tab.type;
          return (
            <button
              key={tab.type}
              type="button"
              onClick={() => {
                onSourceTypeChange(tab.type as typeof sourceType);
                if (tab.type === 'github') void loadGithub();
              }}
              className={`grid content-start gap-1 rounded-2xl border p-4 text-left transition-all ${
                active
                  ? 'border-acc bg-acc/10 ring-2 ring-acc text-ink'
                  : 'border-line bg-card hover:border-ink/40 text-ink2'
              }`}
            >
              <span className="font-semibold">{tab.label}</span>
              <span className="text-[12px] text-ink3">{tab.desc}</span>
            </button>
          );
        })}
      </div>

      {/* Git URL Form */}
      {sourceType === 'git' && (
        <div className="grid gap-3 rounded-2xl border border-line bg-card p-5">
          <TextInput
            label="Public Git repository URL"
            value={gitUrl}
            onChange={(e) => onGitUrlChange(e.target.value)}
            placeholder="https://github.com/organization/repository"
          />
          <div>
            <SoftButton type="button" onClick={() => void inspectGit()} disabled={inspecting || !gitUrl.trim()}>
              {inspecting ? 'Inspecting repository…' : 'Inspect repository'}
            </SoftButton>
          </div>
        </div>
      )}

      {/* GitHub App Form */}
      {sourceType === 'github' && (
        <div className="grid gap-3 rounded-2xl border border-line bg-card p-5">
          {githubRepos.length === 0 ? (
            <div className="grid gap-2">
              <p className="text-[13.5px] text-ink2">No authorized repositories found.</p>
              <p className="text-[12.5px] text-ink3">
                Connect your GitHub account or authorize repositories under Settings → Connections.
              </p>
            </div>
          ) : (
            <div className="grid gap-2">
              <label className="text-[13px] font-medium text-ink">Choose repository</label>
              <select
                value={selectedGithubRepo}
                onChange={(e) => setSelectedGithubRepo(e.target.value)}
                className="w-full rounded-xl border border-line bg-s1 px-3 py-2 text-[14px] text-ink"
              >
                <option value="">Select a repository…</option>
                {githubRepos.map((r) => (
                  <option key={r.repositoryId} value={r.fullName}>
                    {r.fullName} ({r.defaultBranch})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* ZIP Upload Form */}
      {sourceType === 'zip' && (
        <div className="grid gap-3 rounded-2xl border border-line bg-card p-5">
          <label className="text-[13.5px] font-medium text-ink">
            Project ZIP archive (max 8 MB)
            <input
              type="file"
              accept=".zip,application/zip"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleZipUpload(f);
              }}
              className="mt-2 block w-full text-[13.5px] text-ink3 file:mr-4 file:rounded-xl file:border-0 file:bg-s1 file:px-4 file:py-2 file:text-[13px] file:font-semibold file:text-ink hover:file:bg-ink/10"
            />
          </label>
          {zipName && <p className="text-[12.5px] text-ink3">Uploaded: {zipName}</p>}
        </div>
      )}

      {zipError && <p className="text-[13px] text-bad">{zipError}</p>}

      {/* Inspection results report */}
      {inspection && (
        <div className="grid gap-3 rounded-2xl border border-line/80 bg-s1/60 p-5">
          <div className="flex items-center gap-2 text-ink">
            <Icon name="check" size={16} className="text-acc" />
            <span className="font-semibold">Manifest analysis complete</span>
          </div>

          <div className="grid gap-2 text-[13.5px]">
            {inspection.runtime && (
              <div className="flex justify-between">
                <span className="text-ink3">Detected runtime:</span>
                <span className="font-mono font-medium text-ink">{inspection.runtime}</span>
              </div>
            )}
            {inspection.start && (
              <div className="flex justify-between">
                <span className="text-ink3">Startup command:</span>
                <span className="font-mono text-ink">{inspection.start}</span>
              </div>
            )}
            {inspection.build && (
              <div className="flex justify-between">
                <span className="text-ink3">Build command:</span>
                <span className="font-mono text-ink">{inspection.build}</span>
              </div>
            )}
          </div>

          {inspection.notes && inspection.notes.length > 0 && (
            <div className="mt-2 border-t border-line/50 pt-2 text-[12.5px] text-ink3">
              {inspection.notes.map((note, idx) => (
                <p key={idx}>{note}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

