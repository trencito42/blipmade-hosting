import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, get, post, type Order, type Quote } from '../../lib/api';
import { useAction, useAsync } from '../../lib/useAsync';
import { useParams, useRouter } from '../../router';
import { useCatalogOffering, type OfferingVariant, type OfferingPreset } from '../../lib/deploy-studio';
import { memLabel, formatPrice, periodSuffix } from '../../lib/pricing';
import { EmptyState, ErrorState, LoadingBlock, PrimaryButton, SoftButton } from '../../ui-app';
import { ProductWizardShell, type WizardStep } from './ProductWizardShell';
import { emptyBillingAddress, type BillingAddressValue } from '../BillingAddressFields';

// Reusable typed steps
import { PlanComparisonStep } from './steps/PlanComparisonStep';
import { VariantSelectionStep } from './steps/VariantSelectionStep';
import { SoftwareVersionStep } from './steps/SoftwareVersionStep';
import { PresetSelectionStep } from './steps/PresetSelectionStep';
import { PluginSelectionStep, type PluginPick } from './steps/PluginSelectionStep';
import { SourceSelectionStep, type SourceInspectionResult } from './steps/SourceSelectionStep';
import { ResourceConfigurationStep } from './steps/ResourceConfigurationStep';
import { OperatingSystemStep } from './steps/OperatingSystemStep';
import { DomainConfigurationStep } from './steps/DomainConfigurationStep';
import { EnvironmentSetupStep } from './steps/EnvironmentSetupStep';
import { AddonSelectionStep } from './steps/AddonSelectionStep';
import { OrderReviewStep } from './steps/OrderReviewStep';
import { ProvisioningStep } from './steps/ProvisioningStep';
import { IsolatedBuildPanel } from './IsolatedBuildPanel';

export default function DeployStudio({ initialSlug }: { initialSlug?: string } = {}) {
  const params = useParams();
  const rawSlug = initialSlug || params.slug || (typeof location !== 'undefined' && location.pathname.includes('/vps') ? 'vps' : typeof location !== 'undefined' && location.pathname.includes('/email') ? 'email-hosting' : '');
  const slug = rawSlug;
  const { query, navigate } = useRouter();

  // Load authoritative offering
  const offeringState = useCatalogOffering(slug);
  const offering = offeringState.offering;

  // Selected state initialized from query params or offering defaults
  const [selectedVariantSlug, setSelectedVariantSlug] = useState<string>(
    query.variant ?? query.plan ?? '',
  );
  const [selectedPresetSlug, setSelectedPresetSlug] = useState<string | null>(
    query.preset ? query.preset : null,
  );
  const [softwareVersion, setSoftwareVersion] = useState<string>(query.mcVersion ?? query.version ?? '');
  const [selectedPlugins, setSelectedPlugins] = useState<PluginPick[]>([]);
  const [sourceType, setSourceType] = useState<'blank' | 'git' | 'github' | 'zip'>(
    (query.source as 'blank' | 'git' | 'github' | 'zip') ?? (query.import ? 'git' : 'blank'),
  );
  const [gitUrl, setGitUrl] = useState<string>(query.gitUrl ?? '');
  const [inspection, setInspection] = useState<SourceInspectionResult | null>(null);
  const [importSourceId, setImportSourceId] = useState<string | undefined>(
    query.import ?? (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('blipmade:deploy:import') : null) ?? undefined,
  );

  // VPS Specific
  const [selectedOs, setSelectedOs] = useState<string>(query.os ?? 'debian-12');
  const [sshKey, setSshKey] = useState<string>('');
  const [dedicatedIp, setDedicatedIp] = useState<boolean>(query.dedicatedIp === 'true');

  // Resources
  const [ram, setRam] = useState<number>(Number(query.ram) || 1024);
  const [cpu, setCpu] = useState<number>(Number(query.cpu) || 1);
  const [disk, setDisk] = useState<number>(Number(query.disk) || 20);

  // Network & Domain
  const [serviceName, setServiceName] = useState<string>(query.name ?? '');
  const [domain, setDomain] = useState<string>(query.domain ?? query.mailDomain ?? '');
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [selectedOptionCodes, setSelectedOptionCodes] = useState<string[]>(
    query.addons ? query.addons.split(',').filter(Boolean) : [],
  );

  // Billing & Review
  const [period, setPeriod] = useState<'MONTHLY' | 'YEARLY'>(query.period === 'YEARLY' ? 'YEARLY' : 'MONTHLY');
  const [promotionCode, setPromotionCode] = useState<string>(query.promo ?? '');
  const [acceptEula, setAcceptEula] = useState<boolean>(false);
  const [humanToken, setHumanToken] = useState<string | null>(null);
  const [billingAddress, setBillingAddress] = useState<BillingAddressValue>(emptyBillingAddress);

  // Provisioning
  const [orderId, setOrderId] = useState<string | null>(query.order ?? null);
  const [orderError, setOrderError] = useState<string | null>(null);

  // Current Step Index
  const [stepIndex, setStepIndex] = useState<number>(Number(query.step) || 0);

  // Once offering loads, ensure default selections are populated
  useEffect(() => {
    if (!offering) return;

    if (!selectedVariantSlug) {
      const initial =
        offering.defaultVariantSlug ??
        offering.variants.find((v) => v.orderable)?.slug ??
        offering.variants[0]?.slug ??
        '';
      setSelectedVariantSlug(initial);
    }

    if (selectedPresetSlug === null && offering.defaultPresetSlug && offering.presets.length > 0) {
      setSelectedPresetSlug(offering.defaultPresetSlug);
    }
  }, [offering, selectedVariantSlug, selectedPresetSlug]);

  const activeVariant = useMemo(() => {
    if (!offering) return null;
    return (
      offering.variants.find((v) => v.slug === selectedVariantSlug || v.productSlug === selectedVariantSlug) ??
      offering.variants[0] ??
      null
    );
  }, [offering, selectedVariantSlug]);

  // Adjust resources when active variant changes
  useEffect(() => {
    if (!activeVariant) return;
    if (!query.ram && activeVariant.defaultRam) setRam(activeVariant.defaultRam);
    if (!query.cpu && activeVariant.defaultCpu) setCpu(activeVariant.defaultCpu);
    if (!query.disk && activeVariant.defaultDisk) setDisk(activeVariant.defaultDisk);
  }, [activeVariant, query.ram, query.cpu, query.disk]);

  // Update URL state as choices change (for bookmarking and deep linking)
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedVariantSlug) params.set('variant', selectedVariantSlug);
    if (selectedPresetSlug) params.set('preset', selectedPresetSlug);
    if (softwareVersion) params.set('version', softwareVersion);
    if (period === 'YEARLY') params.set('period', 'YEARLY');
    if (ram) params.set('ram', String(ram));
    if (cpu) params.set('cpu', String(cpu));
    if (disk) params.set('disk', String(disk));
    if (domain) params.set('domain', domain);
    if (stepIndex > 0) params.set('step', String(stepIndex));
    if (orderId) params.set('order', orderId);
    if (importSourceId) params.set('import', importSourceId);

    const queryStr = params.toString();
    const targetUrl = `${location.pathname}${queryStr ? `?${queryStr}` : ''}`;
    window.history.replaceState(null, '', targetUrl);
  }, [selectedVariantSlug, selectedPresetSlug, softwareVersion, period, ram, cpu, disk, domain, stepIndex, orderId, importSourceId]);

  // Build the list of wizard steps dynamically based on offering kind and capabilities
  const steps: WizardStep[] = useMemo(() => {
    if (!offering) return [];
    if (orderId) {
      return [{ id: 'provisioning', title: 'Provisioning', description: 'Deploying and initializing service' }];
    }

    const list: WizardStep[] = [];
    const isVps = offering.kind === 'vps' || offering.slug === 'vps';
    const isEmail = offering.kind === 'email' || offering.slug === 'email-hosting';
    const isMinecraft = offering.slug === 'minecraft';
    const isDiscordBot = offering.slug === 'discord-bot';

    if (isVps) {
      list.push({ id: 'plan', title: 'Plan', description: 'Choose compute plan & specs' });
      list.push({ id: 'os', title: 'Operating System', description: 'Select Linux image template' });
      list.push({ id: 'env', title: 'SSH & Credentials', description: 'Configure secure root access' });
      list.push({ id: 'addons', title: 'Network & Add-ons', description: 'Optional dedicated IP & network' });
      list.push({ id: 'review', title: 'Review & Pay', description: 'Confirm configuration & place order' });
      return list;
    }

    if (isEmail) {
      list.push({ id: 'plan', title: 'Plan', description: 'Select mailbox & quota tier' });
      list.push({ id: 'domain', title: 'Domain', description: 'Configure custom email domain' });
      list.push({ id: 'review', title: 'Review & Pay', description: 'Confirm billing term & place order' });
      return list;
    }

    if (isMinecraft) {
      list.push({ id: 'software', title: 'Software', description: 'Select Java or Bedrock engine' });
      list.push({ id: 'version', title: 'Version', description: 'Choose Minecraft release' });
      list.push({ id: 'preset', title: 'Preset', description: 'Start blank or choose a template' });
      list.push({ id: 'plugins', title: 'Plugins', description: 'Add Modrinth plugins or mods' });
      list.push({ id: 'resources', title: 'Resources', description: 'Allocate RAM, CPU & disk' });
      list.push({ id: 'env', title: 'Server Setup', description: 'Set server name & address' });
      list.push({ id: 'review', title: 'Review & Pay', description: 'Review quote & accept EULA' });
      return list;
    }

    if (isDiscordBot) {
      list.push({ id: 'source', title: 'Source & Code', description: 'Select code source or bot template' });
      list.push({ id: 'resources', title: 'Resources', description: 'Set bot compute limits' });
      list.push({ id: 'env', title: 'Environment', description: 'Configure bot token & variables' });
      list.push({ id: 'review', title: 'Review & Pay', description: 'Confirm quote & place order' });
      return list;
    }

    // Default container / app workflow
    if (offering.variants.length > 1) {
      list.push({ id: 'variant', title: 'Software', description: 'Select variant or engine' });
    }
    if (offering.presets.length > 0) {
      list.push({ id: 'preset', title: 'Template', description: 'Starting configuration' });
    }
    list.push({ id: 'resources', title: 'Resources', description: 'Configure memory, CPU and disk' });
    list.push({ id: 'env', title: 'Setup', description: 'Service name & configuration' });
    if (offering.addons.length > 0) {
      list.push({ id: 'addons', title: 'Add-ons', description: 'Optional features & services' });
    }
    list.push({ id: 'review', title: 'Review & Pay', description: 'Confirm quote & place order' });
    return list;
  }, [offering, orderId]);

  // Authoritative server quote calculation
  const quoteState = useAsync<Quote | null>(
    async (signal) => {
      if (!activeVariant) return null;
      const isVps = offering?.kind === 'vps' || activeVariant.fulfilment === 'VPS';
      const isEmail = offering?.kind === 'email' || activeVariant.fulfilment === 'EMAIL';

      const items = [
        {
          productSlug: activeVariant.productSlug,
          ram: isVps || isEmail ? activeVariant.minRam : ram,
          cpu: isVps || isEmail ? activeVariant.minCpu : cpu,
          disk: isVps || isEmail ? activeVariant.minDisk : disk,
          optionCodes: [
            ...selectedOptionCodes,
            ...(dedicatedIp && isVps ? ['dedicated-ipv4'] : []),
          ],
          mailDomain: isEmail ? domain.trim().toLowerCase() : undefined,
        },
      ];

      return api<Quote>('/catalog/quote', {
        method: 'POST',
        body: {
          items,
          promotionCode: promotionCode.trim() || undefined,
          period,
        },
        signal,
      });
    },
    [activeVariant?.productSlug, ram, cpu, disk, selectedOptionCodes, dedicatedIp, domain, promotionCode, period, offering?.kind],
  );

  const quote = quoteState.data ?? null;

  // Order Placement Action
  const placeOrder = useAction(async () => {
    if (!activeVariant || !offering) return;
    setOrderError(null);

    const isVps = offering.kind === 'vps' || activeVariant.fulfilment === 'VPS';
    const isEmail = offering.kind === 'email' || activeVariant.fulfilment === 'EMAIL';
    const isMinecraft = offering.slug === 'minecraft';

    if (isVps && !sshKey.trim()) {
      setOrderError('Please provide your SSH public key for root login.');
      return;
    }

    if (isEmail && !domain.trim()) {
      setOrderError('Please provide your custom email domain.');
      return;
    }

    const optionCodes = [
      ...selectedOptionCodes,
      ...(dedicatedIp && isVps ? ['dedicated-ipv4'] : []),
    ];

    const catalogPayload =
      offering.kind === 'family'
        ? {
            familySlug: offering.slug,
            variantSlug: activeVariant.slug,
            ...(selectedPresetSlug ? { presetSlug: selectedPresetSlug, presetVersion: 1 } : {}),
            addonSlugs: selectedOptionCodes,
            ...(isMinecraft
              ? {
                  install: {
                    gameVersion: softwareVersion || '1.21.1',
                    plugins: selectedPlugins.map((p) => ({ slug: p.slug, version: p.version })),
                  },
                }
              : {}),
          }
        : undefined;

    const orderItem = {
      productSlug: activeVariant.productSlug,
      name: serviceName.trim() || `${offering.name} (${activeVariant.label})`,
      ram: isVps || isEmail ? activeVariant.minRam : ram,
      cpu: isVps || isEmail ? activeVariant.minCpu : cpu,
      disk: isVps || isEmail ? activeVariant.minDisk : disk,
      optionCodes,
      subdomain: domain && !isEmail ? domain.trim().toLowerCase() : undefined,
      mailDomain: isEmail ? domain.trim().toLowerCase() : undefined,
      sshPublicKey: isVps ? sshKey.trim() : undefined,
      vpsName: isVps ? (serviceName.trim() || undefined) : undefined,
      variables: Object.keys(variables).length > 0 ? variables : undefined,
      catalog: catalogPayload,
      importSourceId: importSourceId || undefined,
    };

    try {
      const created = await post<{ order: Order }>('/orders', {
        items: [orderItem],
        period,
        promotionCode: promotionCode.trim() || undefined,
        billingAddress: billingAddress.country ? billingAddress : undefined,
        acceptEula: isMinecraft ? acceptEula : undefined,
        importSourceId: importSourceId || undefined,
      });

      // If free order (total 0), confirm it directly
      if (quote?.total === 0) {
        await post(`/orders/${encodeURIComponent(created.order.id)}/confirm`, {
          turnstileToken: humanToken || undefined,
        });
        setOrderId(created.order.id);
        setStepIndex(steps.length - 1);
        return;
      }

      // If paid order, open checkout or redirect
      const checkout = await post<{ url: string | null; message?: string }>(
        `/orders/${encodeURIComponent(created.order.id)}/checkout`,
      );

      if (checkout.url) {
        location.assign(checkout.url);
        return;
      }

      setOrderId(created.order.id);
      setStepIndex(steps.length - 1);
    } catch (err: unknown) {
      setOrderError(err instanceof Error ? err.message : 'Failed to place order.');
    }
  });

  if (offeringState.loading && !offering) {
    return <LoadingBlock rows={4} label="Loading deploy studio…" />;
  }

  if (offeringState.error || !offering) {
    return (
      <ErrorState
        title="Deployment offering not found"
        message={offeringState.error?.message ?? 'This offering is not available.'}
        onRetry={offeringState.reload}
      />
    );
  }

  const currentStep = steps[stepIndex] ?? steps[0];

  // Validation before advancing to the next step
  const canContinue = (() => {
    if (!currentStep) return false;
    if (currentStep.id === 'plan' || currentStep.id === 'software' || currentStep.id === 'variant') {
      return Boolean(activeVariant?.orderable);
    }
    if (currentStep.id === 'version') {
      return Boolean(softwareVersion);
    }
    if (currentStep.id === 'domain') {
      return Boolean(domain.trim());
    }
    if (currentStep.id === 'os') {
      return Boolean(selectedOs);
    }
    if (currentStep.id === 'env') {
      if (offering.kind === 'vps' || activeVariant?.fulfilment === 'VPS') {
        return Boolean(sshKey.trim());
      }
      if (activeVariant?.customerVariables && typeof activeVariant.customerVariables === 'object') {
        const specs = activeVariant.customerVariables as Record<string, { required?: boolean }>;
        for (const [key, spec] of Object.entries(specs)) {
          if (spec?.required && !variables[key]?.trim()) {
            return false;
          }
        }
      }
    }
    if (currentStep.id === 'review') {
      const isMinecraft = offering.slug === 'minecraft';
      return !placeOrder.pending && (!isMinecraft || acceptEula);
    }
    return true;
  })();

  const handleNext = () => {
    if (currentStep?.id === 'review') {
      void placeOrder.run();
      return;
    }
    setStepIndex((idx) => Math.min(idx + 1, steps.length - 1));
  };

  const handleBack = () => {
    setStepIndex((idx) => Math.max(0, idx - 1));
  };

  // Summary breakdown for the side card
  const isVps = offering.kind === 'vps' || offering.slug === 'vps';
  const isEmail = offering.kind === 'email' || offering.slug === 'email-hosting';

  const summaryDetails: { label: string; value: string }[] = [];
  if (softwareVersion) summaryDetails.push({ label: 'Software Version', value: softwareVersion });
  if (selectedPresetSlug) {
    const p = offering.presets.find((x) => x.slug === selectedPresetSlug);
    summaryDetails.push({ label: 'Preset', value: p?.name ?? selectedPresetSlug });
  }
  if (selectedPlugins.length > 0) {
    summaryDetails.push({ label: 'Plugins', value: `${selectedPlugins.length} selected` });
  }
  if (isVps && selectedOs) {
    summaryDetails.push({ label: 'Operating System', value: selectedOs });
  }
  if (activeVariant && (activeVariant.fulfilment === 'VPS' || isVps)) {
    summaryDetails.push({
      label: 'Compute',
      value: `${activeVariant.minCpu} vCPU · ${memLabel(activeVariant.minRam)} · ${activeVariant.minDisk} GB`,
    });
  } else if (activeVariant && activeVariant.fulfilment !== 'EMAIL' && !isEmail) {
    summaryDetails.push({
      label: 'Resources',
      value: `${cpu} vCPU · ${memLabel(ram)} · ${disk} GB`,
    });
  }
  if (domain) {
    summaryDetails.push({ label: isEmail ? 'Mail Domain' : 'Domain / Hostname', value: domain });
  }
  if (dedicatedIp) {
    summaryDetails.push({ label: 'Dedicated IP', value: 'Yes' });
  }

  const sidebarSummary = (
    <div className="grid gap-3 text-[13px]">
      <div className="border-b border-line/60 pb-2.5">
        <span className="text-[11.5px] font-medium text-ink3">Service</span>
        <p className="font-semibold text-ink text-[15px]">{offering.name}</p>
        <p className="text-[12px] text-ink2">{activeVariant?.label}</p>
      </div>

      <dl className="grid gap-2 border-b border-line/60 pb-2.5">
        {summaryDetails.map((detail, idx) => (
          <div key={idx} className="flex items-baseline justify-between gap-2.5 text-[12.5px]">
            <dt className="shrink-0 text-ink3">{detail.label}</dt>
            <dd className="font-mono text-ink text-right font-medium">{detail.value}</dd>
          </div>
        ))}
      </dl>

      <div>
        <span className="text-ink3">Estimated Price</span>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="font-display text-[22px] font-bold text-acc">
            {(() => {
              if (quote) return formatPrice(quote.total, quote.currency);
              const isYearly = period === 'YEARLY';
              const p = isYearly
                ? (activeVariant?.yearlyPrice ?? (activeVariant?.price ? { ...activeVariant.price, amount: activeVariant.price.amount * 12 } : null))
                : activeVariant?.price;
              return p ? formatPrice(p.amount, p.currency) : '—';
            })()}
          </span>
          <span className="text-[12px] text-ink3">
            {periodSuffix(period)}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <ProductWizardShell
      eyebrow="Deploy"
      title={offering.name}
      description={offering.summary}
      backTo="/app/deploy"
      backLabel="All Offerings"
      steps={steps}
      stepIndex={stepIndex}
      onStep={setStepIndex}
      canContinue={canContinue}
      onContinue={handleNext}
      continueLabel="Next step"
      finalLabel={placeOrder.pending ? 'Placing order…' : quote?.total === 0 ? 'Deploy now' : 'Pay & Deploy'}
      summary={sidebarSummary}
    >
      {importSourceId && (currentStep?.id === 'source' || currentStep?.id === 'resources') && (
        <IsolatedBuildPanel importSourceId={importSourceId} />
      )}

      {/* 1. Plan Comparison Step (VPS / Email) */}
      {currentStep?.id === 'plan' && (
        <PlanComparisonStep
          variants={offering.variants}
          selectedVariantSlug={selectedVariantSlug}
          onSelectVariant={setSelectedVariantSlug}
          period={period}
          onPeriodChange={setPeriod}
          kind={offering.kind}
        />
      )}

      {/* 2. Variant Selection Step (Software) */}
      {(currentStep?.id === 'software' || currentStep?.id === 'variant') && (
        <VariantSelectionStep
          variants={offering.variants}
          selectedVariantSlug={selectedVariantSlug}
          onSelectVariant={setSelectedVariantSlug}
        />
      )}

      {/* 3. Software Version Step */}
      {currentStep?.id === 'version' && activeVariant && (
        <SoftwareVersionStep
          productSlug={activeVariant.productSlug}
          selectedVersion={softwareVersion}
          onSelectVersion={setSoftwareVersion}
        />
      )}

      {/* 4. Preset Selection Step */}
      {currentStep?.id === 'preset' && (
        <PresetSelectionStep
          presets={offering.presets}
          selectedPresetSlug={selectedPresetSlug}
          onSelectPreset={setSelectedPresetSlug}
        />
      )}

      {/* 5. Plugin Selection Step (Minecraft) */}
      {currentStep?.id === 'plugins' && (
        <PluginSelectionStep
          gameVersion={softwareVersion || '1.21.1'}
          loader={activeVariant?.slug === 'minecraft-forge' ? 'forge' : activeVariant?.slug === 'minecraft-bedrock' ? 'bedrock' : 'paper'}
          selectedPlugins={selectedPlugins}
          onTogglePlugin={(plug) => {
            setSelectedPlugins((prev) =>
              prev.some((p) => p.slug === plug.slug)
                ? prev.filter((p) => p.slug !== plug.slug)
                : [...prev, plug].slice(0, 15),
            );
          }}
        />
      )}

      {/* 6. Source Selection Step (Discord Bots & Apps) */}
      {currentStep?.id === 'source' && (
        <SourceSelectionStep
          sourceType={sourceType}
          onSourceTypeChange={setSourceType}
          gitUrl={gitUrl}
          onGitUrlChange={setGitUrl}
          inspection={inspection}
          onInspectionComplete={setInspection}
          importSourceId={importSourceId}
          onImportSourceIdChange={setImportSourceId}
        />
      )}

      {/* 7. Resource Configuration Step */}
      {currentStep?.id === 'resources' && activeVariant && (
        <ResourceConfigurationStep
          ram={ram}
          cpu={cpu}
          disk={disk}
          minRam={activeVariant.minRam}
          maxRam={activeVariant.maxRam}
          minCpu={activeVariant.minCpu}
          maxCpu={activeVariant.maxCpu}
          minDisk={activeVariant.minDisk}
          maxDisk={activeVariant.maxDisk}
          onChangeRam={setRam}
          onChangeCpu={setCpu}
          onChangeDisk={setDisk}
          recommendedRam={activeVariant.defaultRam}
          recommendedCpu={activeVariant.defaultCpu}
          recommendedDisk={activeVariant.defaultDisk}
        />
      )}

      {/* 8. Operating System Step (VPS) */}
      {currentStep?.id === 'os' && (
        <OperatingSystemStep
          selectedOs={selectedOs}
          onSelectOs={setSelectedOs}
        />
      )}

      {/* 9. Domain Configuration Step */}
      {currentStep?.id === 'domain' && (
        <DomainConfigurationStep
          mode={offering.kind === 'email' ? 'email' : 'subdomain'}
          domain={domain}
          onChangeDomain={setDomain}
        />
      )}

      {/* 10. Environment & Credentials Step */}
      {currentStep?.id === 'env' && activeVariant && (
        <EnvironmentSetupStep
          kind={offering.kind === 'vps' ? 'vps' : 'server'}
          sshKey={sshKey}
          onChangeSshKey={setSshKey}
          serviceName={serviceName}
          onChangeServiceName={setServiceName}
          variables={variables}
          onChangeVariable={(k, v) => setVariables((prev) => ({ ...prev, [k]: v }))}
          variableSpecs={activeVariant.customerVariables}
          error={orderError}
        />
      )}

      {/* 11. Add-ons Step */}
      {currentStep?.id === 'addons' && (
        <AddonSelectionStep
          addons={offering.addons}
          selectedOptionCodes={selectedOptionCodes}
          onToggleOptionCode={(code) => {
            setSelectedOptionCodes((prev) =>
              prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
            );
          }}
          hasDedicatedIpOption={offering.kind === 'vps'}
          dedicatedIpSelected={dedicatedIp}
          onToggleDedicatedIp={() => setDedicatedIp((prev) => !prev)}
          dedicatedIpPrice={{ amount: 399, currency: 'EUR' }}
        />
      )}

      {/* 12. Review & Order Step */}
      {currentStep?.id === 'review' && activeVariant && (
        <OrderReviewStep
          offeringName={offering.name}
          variantLabel={activeVariant.label}
          isMinecraft={offering.slug === 'minecraft'}
          acceptEula={acceptEula}
          onAcceptEulaChange={setAcceptEula}
          period={period}
          onPeriodChange={setPeriod}
          promotionCode={promotionCode}
          onPromotionCodeChange={setPromotionCode}
          quote={quote}
          quoteLoading={quoteState.loading}
          quoteError={quoteState.error?.message ?? null}
          billingAddress={billingAddress}
          onBillingAddressChange={setBillingAddress}
          humanToken={humanToken}
          onHumanTokenChange={setHumanToken}
          onPlaceOrder={() => void placeOrder.run()}
          orderPending={placeOrder.pending}
          orderError={orderError}
          summaryDetails={summaryDetails}
        />
      )}

      {/* 13. Provisioning Step */}
      {orderId && <ProvisioningStep orderId={orderId} />}
    </ProductWizardShell>
  );
}
