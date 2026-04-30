'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/costs';
import type { Database } from '@/lib/supabase/types';

type Folder = Database['public']['Tables']['folders']['Row'];
type Project = Database['public']['Tables']['projects']['Row'];
type Budget = Database['public']['Tables']['budgets']['Row'];
type BudgetItem = Database['public']['Tables']['budget_items']['Row'];

export function ProjetosView() {
  const sb = createClient();

  const [folders, setFolders] = useState<Folder[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [items, setItems] = useState<BudgetItem[]>([]);

  const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedBudget, setSelectedBudget] = useState<Budget | null>(null);

  const [newFolderName, setNewFolderName] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [newBudgetName, setNewBudgetName] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState('1');
  const [newItemCost, setNewItemCost] = useState('0');

  useEffect(() => {
    sb.from('folders').select('*').order('created_at').then(({ data }) => setFolders(data ?? []));
  }, []);

  async function fetchProjects(folderId: string) {
    const { data } = await sb.from('projects').select('*').eq('folder_id', folderId).order('created_at');
    setProjects(data ?? []);
  }

  async function fetchBudgets(projectId: string) {
    const { data } = await sb.from('budgets').select('*').eq('project_id', projectId).order('created_at');
    setBudgets(data ?? []);
  }

  async function fetchItems(budgetId: string) {
    const { data } = await sb.from('budget_items').select('*').eq('budget_id', budgetId).order('created_at');
    setItems(data ?? []);
  }

  function selectFolder(folder: Folder) {
    setSelectedFolder(folder);
    setSelectedProject(null);
    setSelectedBudget(null);
    setProjects([]);
    setBudgets([]);
    setItems([]);
    fetchProjects(folder.id);
  }

  function selectProject(project: Project) {
    setSelectedProject(project);
    setSelectedBudget(null);
    setBudgets([]);
    setItems([]);
    fetchBudgets(project.id);
  }

  function selectBudget(budget: Budget) {
    setSelectedBudget(budget);
    setItems([]);
    fetchItems(budget.id);
  }

  async function createFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    const { data: auth } = await sb.auth.getUser();
    const { data, error } = await sb
      .from('folders')
      .insert({ name, user_id: auth.user!.id })
      .select()
      .single();
    if (!error && data) {
      setFolders((prev) => [...prev, data]);
      setNewFolderName('');
    }
  }

  async function createProject() {
    const name = newProjectName.trim();
    if (!name || !selectedFolder) return;
    const { data, error } = await sb
      .from('projects')
      .insert({ name, folder_id: selectedFolder.id })
      .select()
      .single();
    if (!error && data) {
      setProjects((prev) => [...prev, data]);
      setNewProjectName('');
    }
  }

  async function createBudget() {
    const name = newBudgetName.trim();
    if (!name || !selectedProject) return;
    const { data, error } = await sb
      .from('budgets')
      .insert({ name, project_id: selectedProject.id })
      .select()
      .single();
    if (!error && data) {
      setBudgets((prev) => [...prev, data]);
      setNewBudgetName('');
    }
  }

  async function createItem() {
    const name = newItemName.trim();
    if (!name || !selectedBudget) return;
    const qty = parseFloat(newItemQty);
    const cost = parseFloat(newItemCost);
    if (isNaN(qty) || qty <= 0 || isNaN(cost) || cost < 0) return;
    const { data, error } = await sb
      .from('budget_items')
      .insert({ name, quantity: qty, unit_cost: cost, budget_id: selectedBudget.id })
      .select()
      .single();
    if (!error && data) {
      setItems((prev) => [...prev, data]);
      setNewItemName('');
      setNewItemQty('1');
      setNewItemCost('0');
    }
  }

  async function deleteFolder(id: string) {
    await sb.from('folders').delete().eq('id', id);
    setFolders((prev) => prev.filter((f) => f.id !== id));
    if (selectedFolder?.id === id) {
      setSelectedFolder(null);
      setSelectedProject(null);
      setSelectedBudget(null);
      setProjects([]);
      setBudgets([]);
      setItems([]);
    }
  }

  async function deleteProject(id: string) {
    await sb.from('projects').delete().eq('id', id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
    if (selectedProject?.id === id) {
      setSelectedProject(null);
      setSelectedBudget(null);
      setBudgets([]);
      setItems([]);
    }
  }

  async function deleteBudget(id: string) {
    await sb.from('budgets').delete().eq('id', id);
    setBudgets((prev) => prev.filter((b) => b.id !== id));
    if (selectedBudget?.id === id) {
      setSelectedBudget(null);
      setItems([]);
    }
  }

  async function deleteItem(id: string) {
    await sb.from('budget_items').delete().eq('id', id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  const totalGeral = items.reduce((sum, i) => sum + i.quantity * i.unit_cost, 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Projetos</h1>
        <p className="text-sm text-gray-500">Pasta → Projeto → Orçamento → Itens</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
        {/* Pastas */}
        <Panel title="Pastas">
          <form
            onSubmit={(e) => { e.preventDefault(); createFolder(); }}
            className="flex gap-2 mb-3"
          >
            <input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Nova pasta..."
              className="flex-1 min-w-0 rounded border border-gray-200 px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              +
            </button>
          </form>
          {folders.length === 0 && (
            <p className="text-xs text-gray-400">Nenhuma pasta criada.</p>
          )}
          {folders.map((f) => (
            <PanelItem
              key={f.id}
              label={f.name}
              active={selectedFolder?.id === f.id}
              onClick={() => selectFolder(f)}
              onDelete={() => deleteFolder(f.id)}
            />
          ))}
        </Panel>

        {/* Projetos */}
        <Panel
          title={selectedFolder ? `Projetos — ${selectedFolder.name}` : 'Projetos'}
          dimmed={!selectedFolder}
        >
          {!selectedFolder ? (
            <p className="text-xs text-gray-400">Selecione uma pasta.</p>
          ) : (
            <>
              <form
                onSubmit={(e) => { e.preventDefault(); createProject(); }}
                className="flex gap-2 mb-3"
              >
                <input
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Novo projeto..."
                  className="flex-1 min-w-0 rounded border border-gray-200 px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                >
                  +
                </button>
              </form>
              {projects.length === 0 && (
                <p className="text-xs text-gray-400">Nenhum projeto.</p>
              )}
              {projects.map((p) => (
                <PanelItem
                  key={p.id}
                  label={p.name}
                  active={selectedProject?.id === p.id}
                  onClick={() => selectProject(p)}
                  onDelete={() => deleteProject(p.id)}
                />
              ))}
            </>
          )}
        </Panel>

        {/* Orçamentos */}
        <Panel
          title={selectedProject ? `Orçamentos — ${selectedProject.name}` : 'Orçamentos'}
          dimmed={!selectedProject}
        >
          {!selectedProject ? (
            <p className="text-xs text-gray-400">Selecione um projeto.</p>
          ) : (
            <>
              <form
                onSubmit={(e) => { e.preventDefault(); createBudget(); }}
                className="flex gap-2 mb-3"
              >
                <input
                  value={newBudgetName}
                  onChange={(e) => setNewBudgetName(e.target.value)}
                  placeholder="Novo orçamento..."
                  className="flex-1 min-w-0 rounded border border-gray-200 px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                >
                  +
                </button>
              </form>
              {budgets.length === 0 && (
                <p className="text-xs text-gray-400">Nenhum orçamento.</p>
              )}
              {budgets.map((b) => (
                <PanelItem
                  key={b.id}
                  label={b.name}
                  active={selectedBudget?.id === b.id}
                  onClick={() => selectBudget(b)}
                  onDelete={() => deleteBudget(b.id)}
                />
              ))}
            </>
          )}
        </Panel>

        {/* Itens */}
        <Panel
          title={selectedBudget ? `Itens — ${selectedBudget.name}` : 'Itens'}
          dimmed={!selectedBudget}
        >
          {!selectedBudget ? (
            <p className="text-xs text-gray-400">Selecione um orçamento.</p>
          ) : (
            <>
              <form
                onSubmit={(e) => { e.preventDefault(); createItem(); }}
                className="space-y-2 mb-3"
              >
                <input
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  placeholder="Nome do item..."
                  className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                />
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500">Qtd</label>
                    <input
                      value={newItemQty}
                      onChange={(e) => setNewItemQty(e.target.value)}
                      type="number"
                      min="0.0001"
                      step="any"
                      className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-500">Custo unit.</label>
                    <input
                      value={newItemCost}
                      onChange={(e) => setNewItemCost(e.target.value)}
                      type="number"
                      min="0"
                      step="any"
                      className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full rounded bg-blue-600 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Adicionar item
                </button>
              </form>

              {items.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-gray-500">
                        <th className="py-1 text-left font-medium">Item</th>
                        <th className="py-1 text-right font-medium">Qtd</th>
                        <th className="py-1 text-right font-medium">Unit.</th>
                        <th className="py-1 text-right font-medium">Total</th>
                        <th className="w-5 py-1"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.id} className="border-b border-gray-50 hover:bg-blue-50 hover:shadow-[inset_3px_0_0_0_#3b82f6] transition-all">
                          <td className="py-1.5 px-1 text-sm text-gray-900">{item.name}</td>
                          <td className="py-1.5 px-1 text-right text-sm text-gray-700">{item.quantity}</td>
                          <td className="py-1.5 px-1 text-right text-sm text-gray-700">{formatCurrency(item.unit_cost)}</td>
                          <td className="py-0.5 text-right text-gray-700 tabular-nums">
                            {formatCurrency(item.quantity * item.unit_cost)}
                          </td>
                          <td className="py-0.5">
                            <button
                              onClick={() => deleteItem(item.id)}
                              className="text-gray-300 hover:text-red-500 transition-colors"
                              title="Remover"
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={3} className="pt-2 text-right text-xs font-semibold text-gray-600">
                          Total Geral
                        </td>
                        <td className="pt-2 text-right text-sm font-bold text-blue-700 tabular-nums">
                          {formatCurrency(totalGeral)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {items.length === 0 && (
                <p className="text-xs text-gray-400">Nenhum item adicionado.</p>
              )}
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Panel({
  title,
  children,
  dimmed,
}: {
  title: string;
  children: React.ReactNode;
  dimmed?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border bg-white p-4 shadow-sm transition-opacity ${
        dimmed ? 'opacity-40 pointer-events-none' : ''
      }`}
    >
      <h2 className="mb-3 truncate text-sm font-semibold text-gray-700">{title}</h2>
      {children}
    </div>
  );
}

function PanelItem({
  label,
  active,
  onClick,
  onDelete,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`mb-1 flex items-center gap-1 rounded px-2 py-1.5 transition-colors ${
        active ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'
      }`}
    >
      <button onClick={onClick} className="flex-1 truncate text-left text-sm">
        {label}
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="flex-shrink-0 text-gray-300 hover:text-red-500 transition-colors"
        title="Excluir"
      >
        ×
      </button>
    </div>
  );
}
