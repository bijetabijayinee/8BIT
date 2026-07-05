import { AlertCircle, FileUp, Loader2, RefreshCw } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { getKnowledgeDocuments, uploadKnowledgeDocument } from '../../api/client';
import type { KnowledgeDocument } from '../../types/careflow';

export function KnowledgePage() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    setIsLoading(true);
    try {
      setDocuments(await getKnowledgeDocuments());
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to load knowledge documents.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) {
      return;
    }
    setIsUploading(true);
    try {
      await uploadKnowledgeDocument(file, title);
      setTitle('');
      setFile(null);
      await loadDocuments();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to upload document.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <section className="py-6">
      <div className="flex flex-col gap-4 border-b border-sky-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-sky-700">Savi knowledge</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-950">Update hospital knowledge</h2>
        </div>
        <button
          type="button"
          onClick={() => void loadDocuments()}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-sky-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-sky-50"
        >
          <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {error ? (
        <div className="mt-5 flex items-start gap-3 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>{error}</p>
        </div>
      ) : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <form onSubmit={submit} className="rounded-lg border border-sky-100 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-950">Upload PDF or text</h3>
          <label className="mt-4 block text-sm font-medium text-slate-700">
            Knowledge title
            <input value={title} onChange={(event) => setTitle(event.target.value)} className="input-field" placeholder="ER escalation policy" />
          </label>
          <label className="mt-3 block text-sm font-medium text-slate-700">
            File
            <input
              type="file"
              accept=".pdf,.txt,.md"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="input-field h-auto py-2"
            />
          </label>
          <button
            type="submit"
            disabled={!file || isUploading}
            className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isUploading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <FileUp size={16} aria-hidden="true" />}
            {isUploading ? 'Embedding' : 'Upload and embed'}
          </button>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            Uploaded documents are embedded into Savi's context immediately - ask Savi about them from any chat.
          </p>
        </form>

        <div className="rounded-lg border border-sky-100 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-950">Embedded documents</h3>
          <div className="scrollbar-hide mt-4 max-h-72 space-y-3 overflow-y-auto">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-16 animate-pulse rounded-md bg-sky-100" />)
            ) : documents.length === 0 ? (
              <p className="rounded-md bg-sky-50 p-4 text-sm text-slate-500">No hospital knowledge uploaded yet.</p>
            ) : (
              documents.map((document) => (
                <article key={document.id} className="rounded-md border border-sky-100 bg-sky-50 p-3">
                  <p className="text-sm font-semibold text-slate-950">{document.title}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {document.fileName} - {document.contentLength.toLocaleString()} chars - {new Date(document.updatedAt).toLocaleString()}
                  </p>
                </article>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
