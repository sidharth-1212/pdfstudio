import { useState, useRef, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import MyPdfWorker from './workers/pdfWorker.js?worker'; 

import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Rnd } from 'react-rnd'; 
import { Analytics } from '@vercel/analytics/react';
import { DodoPayments } from 'dodopayments-checkout';
import { BrowserRouter as Router, Routes, Route, useNavigate, useParams } from 'react-router-dom';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

function PdfEngineWrapper({ activeTab, handleTabChange, children }) {
  const { tabId } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    // If the URL has a tabId (e.g., /merge), sync it to your app state
    if (tabId && tabId !== activeTab) {
      handleTabChange(tabId);
    }
  }, [tabId]);

  return children;
}

function SortableThumbnail({ id, url, originalIndex }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="relative cursor-grab active:cursor-grabbing hover:shadow-lg transition-shadow border border-zinc-800 rounded-lg overflow-hidden bg-zinc-900 z-10 touch-none">
      <img src={url} alt={`Page ${originalIndex + 1}`} className="w-full h-auto object-cover pointer-events-none bg-white" />
      <div className="absolute bottom-2 right-2 bg-black bg-opacity-80 text-white text-xs px-2 py-1 rounded font-bold">{originalIndex + 1}</div>
    </div>
  );
}

function App() {
  return (
    <>
      <Routes>
        <Route path="/:tabId" element={<PdfStudio />} />
        <Route path="/" element={<PdfStudio />} />
      </Routes>
      <PdfStudio />
      <Analytics />
    </>
  );
}

function PdfStudio() {
  const { tabId } = useParams();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('reorder'); 
  const [isProcessing, setIsProcessing] = useState(false);
  const workerRef = useRef(null);

  //Mobile Styling
  const mainFileInputRef = useRef(null);
  const mergeInputRef = useRef(null);
  const protectInputRef = useRef(null);
  const signatureInputRef = useRef(null);

  const [mergeFiles, setMergeFiles] = useState([]);
  const [activeFile, setActiveFile] = useState(null); 
  const [documentPages, setDocumentPages] = useState([]); 
  const [password, setPassword] = useState('');
  const [watermarkText, setWatermarkText] = useState('CONFIDENTIAL'); 
  
  const [signatureImage, setSignatureImage] = useState(null); 
  const [signatureAspect, setSignatureAspect] = useState(2); 
  const [signStep, setSignStep] = useState('draw'); 
  const [targetPage, setTargetPage] = useState(null); 
  const [pendingDrop, setPendingDrop] = useState(false); 
  const [placedSignatures, setPlacedSignatures] = useState([]); 
  const [activeSignatureId, setActiveSignatureId] = useState(null); 

  const [dragActive, setDragActive] = useState(false);
  
  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const dodoInitialized = useRef(false);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleVisualFileChange({ target: { files: e.dataTransfer.files } });
    }
  };

  const extractSignatureFromImage = (imageFile) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;
          for (let i = 0; i < data.length; i += 4) {
            const brightness = (0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2]);
            if (brightness > 160) data[i + 3] = 0;
            else { data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; }
          }
          ctx.putImageData(imageData, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = reject;
        img.src = event.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(imageFile);
    });
  };

  const handleUploadSignature = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const transparentPngUrl = await extractSignatureFromImage(file);
      setSignatureImage(transparentPngUrl);
      const img = new Image();
      img.onload = () => {
        const aspect = img.width / img.height;
        setSignatureAspect(aspect);
        if (documentPages.length > 0 && targetPage !== null) {
          const newId = Date.now();
          setPlacedSignatures(prev => [...prev, { id: newId, pageIndex: targetPage, image: transparentPngUrl, x: 50, y: 50, width: 200, height: 200 / aspect }]);
          setActiveSignatureId(newId);
          setSignStep('place');
        } else {
          setPendingDrop(true);
          setSignStep('select-page'); 
        }
      };
      img.src = transparentPngUrl;
    } catch (error) {
      alert("Failed to process signature image.");
    }
  };

  const handleTabChange = (tab) => {
    navigate(`/${tab}`);
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    // 1. If the URL is just '/', send them to 'reorder'
    if (!tabId) {
      navigate('/reorder', { replace: true });
      return;
    }

    // 2. Sync activeTab state to the URL
    setActiveTab(tabId);

    // 3. YOUR CLEANUP LOGIC: Fires automatically on URL change
    setMergeFiles([]);
    setActiveFile(null);
    setDocumentPages([]);
    setPassword('');
    setWatermarkText('CONFIDENTIAL'); 
    setSignatureImage(null);
    setSignStep('draw');
    setTargetPage(null);
    setPendingDrop(false);
    setPlacedSignatures([]); 
    setActiveSignatureId(null);

    // Scroll to top for a fresh view
    window.scrollTo(0, 0);

  }, [tabId, navigate]); // Triggers every time the URL suffix changes

  useEffect(() => {
    workerRef.current = new MyPdfWorker();
    workerRef.current.onmessage = (e) => {
      const { status, data, error } = e.data;
      setIsProcessing(false);
      
      if (status === 'success') {
        const blob = new Blob([data], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
  
        let baseName = "document";
        
        if (activeTab === 'merge' && mergeFiles.length > 0) {
          baseName = mergeFiles[0].name.replace(/\.[^/.]+$/, "");
        } else if (activeFile) {
          baseName = activeFile.name.replace(/\.[^/.]+$/, "");
        }

        const a = document.createElement('a');
        a.href = url;

        a.download = `${baseName}_${activeTab}_pdfstudio.pdf`;
        
        a.click();
        URL.revokeObjectURL(url);
      } else {
        alert('Worker returned an error: ' + error);
      }
    };
    return () => workerRef.current?.terminate();
  }, [activeTab, activeFile, mergeFiles]);

  useEffect(() => {
    if (activeTab === 'sign' && canvasRef.current && signStep === 'draw') {
      const canvas = canvasRef.current;
      canvas.width = canvas.offsetWidth * 2;
      canvas.height = canvas.offsetHeight * 2;
      const context = canvas.getContext("2d");
      context.scale(2, 2);
      context.lineCap = "round";
      context.strokeStyle = "#000000"; 
      context.lineWidth = 4; 
      contextRef.current = context;
    }
  }, [activeTab, activeFile, signStep, documentPages]);

  const handleSupportClick = async () => {
    setIsProcessing(true);
    
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: '', name: '' }),
      });

      const session = await response.json();
      
      if (session.url) {
        window.open(session.url, '_blank', 'noopener,noreferrer');
      } else {
        console.error("Backend Error Details:", session.error);
        alert(`Checkout failed: ${session.error || 'Unknown server error'}`);
      }
    } catch (error) {
      console.error("Network/Fetch Error:", error);
      alert("Failed to connect to the payment server.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Mobile-Optimized Coordinate Handler
  const getCoordinates = (e) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left),
      y: (clientY - rect.top)
    };
  };

  const startDrawing = (e) => {
    if (!contextRef.current) return;
    if (e.type === 'touchstart') e.preventDefault();  
    const { x, y } = getCoordinates(e.nativeEvent || e);
    contextRef.current.beginPath();
    contextRef.current.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing || !contextRef.current) return;
    const { x, y } = getCoordinates(e.nativeEvent || e);
    contextRef.current.lineTo(x, y);
    contextRef.current.stroke();
  };

  const stopDrawing = () => {
    if (!contextRef.current) return;
    contextRef.current.closePath();
    setIsDrawing(false);
  };

  const clearSignature = () => {
    if (!contextRef.current) return;
    contextRef.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
  };

  const saveSignature = () => {
    const canvas = canvasRef.current;
    const dataUrl = canvas.toDataURL("image/png");
    setSignatureImage(dataUrl);
    setSignatureAspect(canvas.width / canvas.height);
    if (documentPages.length > 0 && targetPage !== null) {
      const newId = Date.now();
      setPlacedSignatures(prev => [...prev, { id: newId, pageIndex: targetPage, image: dataUrl, x: 50, y: 50, width: 200, height: 200 / (canvas.width / canvas.height) }]);
      setActiveSignatureId(newId);
      setSignStep('place');
    } else {
      setPendingDrop(true);
      setSignStep('select-page'); 
    }
  };

  const handleVisualFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsProcessing(true);
    setDocumentPages([]); 
    setActiveFile(file);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument(new Uint8Array(arrayBuffer)).promise;
      const generatedPages = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 }); 
        const canvas = document.createElement('canvas');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        generatedPages.push({ id: `page-${i - 1}`, index: i - 1, url: canvas.toDataURL(), selected: false, rotation: 0, originalWidth: viewport.width, originalHeight: viewport.height });
      }
      setDocumentPages(generatedPages);
    } catch (error) {
      alert("Failed to render PDF thumbnails.");
    }
    setIsProcessing(false);
  };

  const togglePageSelection = (index) => setDocumentPages(pages => pages.map(p => p.index === index ? { ...p, selected: !p.selected } : p));
  const handleVisualRotate = (direction, allPages = false) => {
    const angleChange = direction === 'right' ? 90 : -90;
    setDocumentPages(pages => pages.map(p => (allPages || p.selected) ? { ...p, rotation: p.rotation + angleChange } : p));
  };

  const handleApplyRotations = async () => {
    const pageRotations = {};
    documentPages.forEach(p => { if (p.rotation % 360 !== 0) pageRotations[p.index] = p.rotation; });
    if (Object.keys(pageRotations).length === 0) return;
    setIsProcessing(true);
    workerRef.current.postMessage({ action: 'rotate', file: await activeFile.arrayBuffer(), pageRotations });
  };

  const handleMerge = async () => {
    setIsProcessing(true);
    workerRef.current.postMessage({ action: 'merge', files: await Promise.all(mergeFiles.map(f => f.arrayBuffer())) });
  };

  const handleExtract = async () => {
    setIsProcessing(true);
    workerRef.current.postMessage({ action: 'extract', file: await activeFile.arrayBuffer(), selectedIndices: documentPages.filter(p => p.selected).map(p => p.index) });
  };

  const handleReorder = async () => {
    setIsProcessing(true);
    workerRef.current.postMessage({ action: 'reorder', file: await activeFile.arrayBuffer(), selectedIndices: documentPages.map(p => p.index) });
  };

  const handleProtect = async () => {
    if (!password) return;
    setIsProcessing(true);
    workerRef.current.postMessage({ action: 'protect', file: await activeFile.arrayBuffer(), password });
  };

  const handleWatermark = async () => {
    if (!watermarkText.trim()) return;
    setIsProcessing(true);
    workerRef.current.postMessage({ action: 'watermark', file: await activeFile.arrayBuffer(), watermarkText });
  };

  const handlePageNumbers = async () => {
    setIsProcessing(true);
    workerRef.current.postMessage({ action: 'pageNumbers', file: await activeFile.arrayBuffer() });
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      setDocumentPages((items) => arrayMove(items, items.findIndex(i => i.id === active.id), items.findIndex(i => i.id === over.id)));
    }
  };

  const handleSign = async () => {
    if (placedSignatures.length === 0) return;
    setIsProcessing(true);
    const scaleFactor = 1 / 1.5;
    const translatedSignatures = placedSignatures.map(sig => ({
      pageIndex: sig.pageIndex,
      image: sig.image,
      x: sig.x * scaleFactor,
      y: (documentPages[sig.pageIndex].originalHeight - (sig.y + sig.height)) * scaleFactor, 
      width: sig.width * scaleFactor,
      height: sig.height * scaleFactor,
    }));
    workerRef.current.postMessage({ action: 'sign', file: await activeFile.arrayBuffer(), placedSignatures: translatedSignatures });
  };

  return (
    <div 
      className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center p-4 sm:p-6 overflow-x-hidden"
      onDragEnter={handleDrag}
    >
      {/* GLOBAL DRAG OVERLAY */}
      {dragActive && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-red-900/10 backdrop-blur-md border-4 border-dashed border-red-800 m-4 rounded-3xl transition-all"
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <div className="text-center animate-pulse">
            <p className="text-4xl font-black uppercase italic tracking-tighter text-red-500">
              Drop to <span className="text-white">Initialize</span>
            </p>
            <p className="text-xs font-bold text-red-900 uppercase tracking-[0.5em] mt-2">
              Secure Local Processing Active
            </p>
          </div>
        </div>
      )}
      {/* GLOBAL HEADER */}
      <div className="w-full max-w-5xl flex flex-col sm:flex-row justify-between items-baseline mb-8 px-2 border-b border-zinc-900 pb-6">
        <div>
          <h1 className="text-5xl font-black tracking-tighter text-zinc-100 flex items-center gap-1">
            PDF<span className="text-red-800">STUDIO</span>
            <span className="text-[10px] bg-red-900/20 text-red-500 border border-red-900/30 px-2 py-0.5 rounded-full ml-3 uppercase tracking-tighter font-bold italic shadow-sm">
              v1.2
            </span>
          </h1>
          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.4em] mt-1 pl-1">
            Advanced PDF Markup Logic
          </p>
        </div>
        
        <div className="hidden sm:flex flex-col items-end opacity-40">
          <span className="text-[9px] font-mono text-zinc-400 uppercase tracking-widest">
            Status: Portfolio Project (Live)
          </span>
          <span className="text-[9px] font-mono text-zinc-400 uppercase tracking-widest">
            Build: 04.2026
          </span>
        </div>
      </div>

      {/* NAVIGATION BAR */}
      <div className="flex flex-wrap justify-center gap-2 mb-8 bg-zinc-900 p-2 rounded-xl border border-zinc-800 shadow-2xl">
        {['reorder', 'extract', 'merge', 'rotate', 'protect', 'watermark', 'page-numbers', 'sign'].map(tab => (
          <button 
            key={tab} 
            onClick={() => handleTabChange(tab)} 
            className={`px-4 py-2 rounded-lg font-bold capitalize transition-all ${activeTab === tab ? 'bg-red-800 text-white shadow-lg shadow-red-900/20' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}
          >
            {tab.replace('-', ' ')}
          </button>
        ))}
      </div>

      {/* MAIN CARD */}
      <div className="max-w-5xl w-full bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-800 p-4 sm:p-8">
        <h1 className="text-4xl font-black uppercase tracking-tighter italic text-zinc-100 mb-2 tracking-tight capitalize">
          {activeTab.replace('-', ' ')} <span className="text-red-800 ml-2">PDFs.</span>
        </h1>
        <p className="text-zinc-500 uppercase text-xs tracking-widest font-bold mb-8">Precision PDF Editing / Client-Side Only</p>

        {activeTab === 'merge' && ( 
           <div className="max-w-xl mx-auto text-center">
             <div className="border-2 border-dashed border-zinc-800 rounded-xl p-8 sm:p-12 flex flex-col items-center justify-center mb-8 bg-zinc-950 hover:border-red-900/40 transition-colors group">
               <input 
                  type="file" 
                  ref={mergeInputRef}
                  multiple 
                  accept="application/pdf" 
                  onChange={(e) => {
                    const newFiles = Array.from(e.target.files);
                    setMergeFiles(prev => [...prev, ...newFiles]);
                    e.target.value = null; 
                  }} 
                  className="hidden" 
                />
               <button 
                 onClick={() => mergeInputRef.current.click()}
                 className="bg-red-900/20 text-red-500 border border-red-900/30 px-8 py-3 rounded-full font-bold uppercase text-xs tracking-widest hover:bg-red-900/40 transition-all mb-4 w-full sm:w-auto"
               >
                 Choose Files
               </button>
               <p className="text-[10px] text-zinc-500 font-mono uppercase truncate max-w-full px-4">
                 {mergeFiles.length > 0 ? `${mergeFiles.length} Files Staged` : "System Idle: No file detected"}
               </p>
             </div>

             {mergeFiles.length > 0 && (
                <div className="w-full mb-8 space-y-2">
                  <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-3">
                    Staged for Processing
                  </p>
                  <div className="grid gap-2">
                    {mergeFiles.map((file, index) => (
                      <div 
                        key={`${file.name}-${index}`} 
                        className="flex items-center justify-between bg-zinc-950 border border-zinc-800 p-3 rounded-xl group hover:border-red-900/40 transition-colors"
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          <span className="text-red-800 font-black text-xs px-2 italic">{index + 1}</span>
                          <p className="text-xs font-mono text-zinc-300 truncate uppercase">
                            {file.name}
                          </p>
                        </div>
                        <button 
                          onClick={() => setMergeFiles(prev => prev.filter((_, i) => i !== index))}
                          className="text-zinc-600 hover:text-red-500 p-1 transition-colors"
                          title="Remove from queue"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

             <button onClick={handleMerge} disabled={isProcessing || mergeFiles.length < 2} className={`w-full py-4 px-6 rounded-xl font-bold text-zinc-100 shadow-lg shadow-red-900/20 transition-all ${isProcessing || mergeFiles.length < 2 ? 'bg-zinc-800 text-zinc-600 border border-zinc-700 cursor-not-allowed' : 'bg-red-800 hover:bg-red-900 border border-red-700/50'}`}>
               {isProcessing ? 'Merging Files...' : 'Merge Documents'}
             </button>
           </div>
        )}

        {activeTab === 'protect' && ( 
           <div className="max-w-xl mx-auto">
             <div className="border-2 border-dashed border-zinc-800 rounded-xl p-8 sm:p-12 flex flex-col items-center justify-center mb-8 bg-zinc-950 hover:border-red-900/40 transition-colors">
               <input 
                 type="file" 
                 ref={protectInputRef}
                 accept="application/pdf" 
                 onChange={(e) => setActiveFile(e.target.files[0])} 
                 className="hidden" 
               />
               <button 
                 onClick={() => protectInputRef.current.click()}
                 className="bg-red-900/20 text-red-500 border border-red-900/30 px-8 py-3 rounded-full font-bold uppercase text-xs tracking-widest hover:bg-red-900/40 transition-all mb-4 w-full sm:w-auto"
               >
                 Choose File
               </button>
               <p className="text-[10px] text-zinc-500 font-mono uppercase truncate max-w-full px-4 text-center">
                 {activeFile ? activeFile.name : "System Idle: No file detected"}
               </p>
             </div>
             {activeFile && (
               <div className="mb-6">
                 <label className="block text-xs font-black text-zinc-500 uppercase tracking-widest mb-2">Initialize Encryption Key</label>
                 <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter Security Password" className="w-full p-4 bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-xl focus:ring-2 focus:ring-red-900/50 outline-none" />
               </div>
             )}
             <button onClick={handleProtect} disabled={isProcessing || !activeFile || !password} className={`w-full py-4 px-6 rounded-xl font-bold text-zinc-100 shadow-lg shadow-red-900/20 transition-all ${isProcessing || !activeFile || !password ? 'bg-zinc-800 text-zinc-600 border border-zinc-700 cursor-not-allowed' : 'bg-red-800 hover:bg-red-900 border border-red-700/50'}`}>
               {isProcessing ? 'Encrypting...' : 'Encrypt & Download'}
             </button>
           </div>
        )}

        {['extract', 'reorder', 'rotate', 'sign', 'watermark', 'page-numbers'].includes(activeTab) && (
          <div className="w-full overflow-hidden">
            <div className={`border-2 border-dashed border-zinc-800 rounded-xl p-8 sm:p-12 flex flex-col items-center justify-center mb-8 bg-zinc-950 hover:border-red-900/40 transition-colors max-w-xl mx-auto ${activeTab === 'sign' && signStep === 'place' ? 'hidden' : ''}`}>
              <input 
                key={activeTab} 
                ref={mainFileInputRef}
                type="file" 
                accept="application/pdf" 
                onChange={handleVisualFileChange} 
                className="hidden" 
              />
               <button 
                 onClick={() => mainFileInputRef.current.click()}
                 className="bg-red-900/20 text-red-500 border border-red-900/30 px-8 py-3 rounded-full font-bold uppercase text-xs tracking-widest hover:bg-red-900/40 transition-all mb-4 w-full sm:w-auto"
               >
                 Choose File
               </button>
               <p className="text-[10px] text-zinc-500 font-mono uppercase truncate max-w-full px-4 text-center">
                 {activeFile ? activeFile.name : "System Idle: No file detected"}
               </p>
            </div>

            {documentPages.length > 0 && (
              <>
                {activeTab === 'sign' && (
                  <div className="w-full">
                    {signStep === 'draw' && (
                      <div className="max-w-xl mx-auto mb-6">
                         <label className="block text-xs font-black text-zinc-500 uppercase tracking-widest mb-3">Signature Pad</label>
                         <canvas 
                            ref={canvasRef} 
                            onMouseDown={startDrawing} 
                            onMouseMove={draw} 
                            onMouseUp={stopDrawing} 
                            onMouseLeave={stopDrawing} 
                            onTouchStart={startDrawing}
                            onTouchMove={draw}
                            onTouchEnd={stopDrawing}
                            className="w-full h-48 bg-white border-2 border-zinc-800 rounded-xl cursor-crosshair shadow-inner" 
                            style={{ touchAction: 'none' }} 
                         />
                         <div className="flex justify-between mt-3 px-1">
                           <button onClick={clearSignature} className="text-xs font-bold text-zinc-500 uppercase tracking-widest hover:text-red-500 transition-colors">Clear Pad</button>
                           <button onClick={saveSignature} className="text-xs font-bold text-red-500 uppercase tracking-widest hover:text-red-400 transition-colors">Confirm Sign</button>
                         </div>
                         <div className="mt-8 pt-8 border-t border-zinc-800">
                           <label className="block text-xs font-black text-zinc-500 uppercase tracking-widest mb-3">Input (Image Upload)</label>
                           <input 
                             type="file" 
                             ref={signatureInputRef}
                             accept="image/*" 
                             onChange={handleUploadSignature} 
                             className="hidden" 
                           />
                           <button 
                             onClick={() => signatureInputRef.current.click()}
                             className="w-full bg-zinc-800 text-zinc-300 border border-zinc-700 py-3 rounded-xl font-bold uppercase text-xs tracking-widest hover:bg-zinc-700 transition-all"
                           >
                             Upload Signature Image
                           </button>
                         </div>
                      </div>
                    )}

                    {signStep === 'select-page' && (
                      <div className="mb-8">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6">
                          <p className="font-bold text-zinc-400 uppercase text-xs tracking-widest">Page Selection Grid</p>
                          <div className="flex gap-2 mt-4 sm:mt-0">
                            <button onClick={() => setSignStep('draw')} className="py-2 px-4 rounded-lg font-bold text-zinc-300 bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 transition-all text-xs uppercase tracking-tighter">Draw New</button>
                            <button onClick={handleSign} disabled={isProcessing || placedSignatures.length === 0} className={`py-2 px-5 rounded-lg font-bold text-zinc-100 shadow-md transition-all text-xs uppercase tracking-tighter ${isProcessing || placedSignatures.length === 0 ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed border border-zinc-700' : 'bg-red-800 hover:bg-red-900 border border-red-700/50'}`}>{isProcessing ? 'Processing...' : 'Commit to Document'}</button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-6 max-h-[400px] overflow-y-auto p-6 bg-zinc-950 rounded-2xl border border-zinc-800 shadow-inner">
                          {documentPages.map((page) => {
                            const sigCount = placedSignatures.filter(s => s.pageIndex === page.index).length;
                            return (
                              <div key={page.id} onClick={() => { setTargetPage(page.index); setSignStep('place'); if (pendingDrop && signatureImage) { const newId = Date.now(); setPlacedSignatures(prev => [...prev, { id: newId, pageIndex: page.index, image: signatureImage, x: 50, y: 50, width: 200, height: 100 }]); setPendingDrop(false); } }} className={`relative cursor-pointer hover:scale-105 border rounded-xl overflow-hidden bg-zinc-900 transition-all ${sigCount > 0 ? 'ring-2 ring-red-800 border-red-800 shadow-lg shadow-red-900/20' : 'border-zinc-800 hover:border-zinc-700'}`}>
                                <img src={page.url} alt={`Page ${page.index + 1}`} className="w-full h-auto object-cover opacity-90" />
                                <div className="absolute bottom-2 right-2 bg-zinc-900/90 text-zinc-100 text-[10px] px-2 py-1 rounded-md font-black">{page.index + 1}</div>
                                {sigCount > 0 && <div className="absolute top-2 right-2 bg-red-800 text-white text-[9px] px-2 py-1 rounded shadow-lg z-10 font-black uppercase tracking-widest">{sigCount} {sigCount === 1 ? 'Sign' : 'Signs'}</div>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {signStep === 'place' && (
                      <div className="flex flex-col items-center mb-8">
                        <p className="text-zinc-500 uppercase text-[10px] font-black tracking-widest mb-6">Editing Workspace / Page {targetPage + 1}</p>
                        <div className="p-2 sm:p-4 bg-zinc-950 rounded-2xl border border-zinc-800 overflow-x-auto w-full shadow-inner" onClick={() => setActiveSignatureId(null)}>
                          <div className="relative bg-white shadow-2xl border border-zinc-800 mx-auto" style={{ width: documentPages[targetPage]?.originalWidth, height: documentPages[targetPage]?.originalHeight, minWidth: documentPages[targetPage]?.originalWidth }}>
                            <img src={documentPages[targetPage]?.url} className="w-full h-auto pointer-events-none" alt="Document Background" />
                            {placedSignatures.filter(s => s.pageIndex === targetPage).map(sig => (
                              <Rnd key={sig.id} bounds="parent" lockAspectRatio={true} position={{ x: sig.x, y: sig.y }} size={{ width: sig.width, height: sig.height }} onDragStart={() => setActiveSignatureId(sig.id)} onDragStop={(e, d) => setPlacedSignatures(prev => prev.map(s => s.id === sig.id ? { ...s, x: d.x, y: d.y } : s))} onResizeStart={() => setActiveSignatureId(sig.id)} onResizeStop={(e, dir, ref, delta, pos) => setPlacedSignatures(prev => prev.map(s => s.id === sig.id ? { ...s, width: parseInt(ref.style.width), height: parseInt(ref.style.height), ...pos } : s))} onClick={(e) => { e.stopPropagation(); setActiveSignatureId(sig.id); }} className={`border-2 group cursor-move ${activeSignatureId === sig.id ? 'border-red-800 border-solid z-50' : 'border-transparent hover:border-zinc-400 border-dashed z-10'}`}>
                                <img src={sig.image} className="w-full h-full pointer-events-none" alt="Your Signature" />
                                {activeSignatureId === sig.id && <button onClick={(e) => { e.stopPropagation(); setPlacedSignatures(prev => prev.filter(s => s.id !== sig.id)); }} className="absolute -top-3 -right-3 bg-red-600 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm shadow-xl hover:bg-red-700 z-50 transition-colors border-2 border-white">✕</button>}
                              </Rnd>
                            ))}
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-4 mt-8 w-full max-w-2xl px-4">
                          <button onClick={() => { if (!signatureImage) return; const newId = Date.now(); setPlacedSignatures(prev => [...prev, { id: newId, pageIndex: targetPage, image: signatureImage, x: 50, y: 50, width: 200, height: 100 }]); setActiveSignatureId(newId); }} className="flex-1 py-4 px-4 rounded-xl font-bold text-red-500 bg-red-900/10 border border-red-900/30 hover:bg-red-900/20 transition-all uppercase text-xs tracking-widest">Add Sign Copy</button>
                          <button onClick={() => setSignStep('draw')} className="flex-1 py-4 px-4 rounded-xl font-bold text-zinc-300 bg-zinc-800 border border-zinc-700 hover:bg-zinc-750 transition-all uppercase text-xs tracking-widest">Redraw Sign</button>
                          <button onClick={() => { setTargetPage(null); setSignStep('select-page'); }} className="flex-1 py-4 px-4 rounded-xl font-bold text-zinc-400 bg-zinc-900 border border-zinc-800 hover:bg-zinc-850 transition-all uppercase text-xs tracking-widest">Back to Grid</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* STANDARD VISUAL GRIDS */}
                {activeTab === 'reorder' && (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={documentPages.map(p => p.id)} strategy={rectSortingStrategy}>
                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-6 mb-8 max-h-[600px] overflow-y-auto p-6 bg-zinc-950 rounded-2xl border border-zinc-800 shadow-inner">
                        {documentPages.map((page) => <SortableThumbnail key={page.id} id={page.id} url={page.url} originalIndex={page.index} />)}
                      </div>
                    </SortableContext>
                    <button onClick={handleReorder} disabled={isProcessing} className={`w-full max-w-md mx-auto block py-4 px-6 rounded-xl font-bold text-zinc-100 shadow-lg shadow-red-900/20 transition-all ${isProcessing ? 'bg-zinc-800 text-zinc-600 border border-zinc-700 cursor-not-allowed' : 'bg-red-800 hover:bg-red-900 border border-red-700/50'}`}>
                      {isProcessing ? 'Processing Sequence...' : 'Reorder into New Sequence'}
                    </button>
                  </DndContext>
                )}

                {['extract', 'rotate'].includes(activeTab) && (
                  <div className="text-center">
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-6 mb-8 max-h-[600px] overflow-y-auto p-6 bg-zinc-950 rounded-2xl border border-zinc-800 shadow-inner">
                      {documentPages.map((page) => (
                        <div key={page.id} onClick={() => togglePageSelection(page.index)} className={`relative cursor-pointer transition-all duration-300 transform hover:-translate-y-1 ${page.selected ? 'ring-4 ring-red-800 rounded-xl shadow-2xl shadow-red-900/30' : 'hover:shadow-md border border-zinc-800 rounded-xl'} overflow-hidden bg-zinc-900`}>
                          <img src={page.url} alt={`Page ${page.index + 1}`} className="w-full h-auto object-cover bg-white opacity-90" style={{ transform: `rotate(${page.rotation}deg)` }} />
                          <div className="absolute bottom-2 right-2 bg-zinc-900/90 text-zinc-100 text-[10px] px-2 py-1 rounded font-black z-10">{page.index + 1}</div>
                          {page.selected && <div className="absolute top-2 right-2 bg-red-800 text-white rounded-full p-1 shadow-lg z-10"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg></div>}
                        </div>
                      ))}
                    </div>
                    {activeTab === 'extract' && (
                      <button onClick={handleExtract} disabled={isProcessing || !documentPages.some(p => p.selected)} className={`w-full max-w-md mx-auto block py-4 px-6 rounded-xl font-bold text-zinc-100 transition-all ${isProcessing || !documentPages.some(p => p.selected) ? 'bg-zinc-800 text-zinc-600 border border-zinc-700 cursor-not-allowed' : 'bg-red-800 hover:bg-red-900 shadow-lg shadow-red-900/20 border border-red-700/50'}`}>
                        {isProcessing ? 'Processing...' : `Extract ${documentPages.filter(p => p.selected).length} Selected Pages`}
                      </button>
                    )}
                    {activeTab === 'rotate' && (
                      <div className="max-w-2xl mx-auto space-y-6">
                        <div className="flex flex-wrap justify-center gap-3 bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                          <button onClick={() => handleVisualRotate('left')} disabled={!documentPages.some(p => p.selected)} className={`px-4 py-2 rounded-lg font-bold text-xs uppercase transition-colors ${!documentPages.some(p => p.selected) ? 'text-zinc-600 cursor-not-allowed' : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700 border border-zinc-700 shadow-sm'}`}>↺ Selected Left</button>
                          <button onClick={() => handleVisualRotate('right')} disabled={!documentPages.some(p => p.selected)} className={`px-4 py-2 rounded-lg font-bold text-xs uppercase transition-colors ${!documentPages.some(p => p.selected) ? 'text-zinc-600 cursor-not-allowed' : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700 border border-zinc-700 shadow-sm'}`}>Selected Right ↻</button>
                          <button onClick={() => handleVisualRotate('right', true)} className="px-4 py-2 rounded-lg font-bold text-xs uppercase bg-zinc-800 text-red-500 hover:bg-zinc-700 border border-zinc-700 shadow-sm transition-colors ml-auto">Rotate All ↻</button>
                        </div>
                        <button onClick={handleApplyRotations} disabled={isProcessing} className={`w-full block py-4 px-6 rounded-xl font-bold text-zinc-100 shadow-lg shadow-red-900/20 transition-all ${isProcessing ? 'bg-zinc-800 text-zinc-600 border border-zinc-700 cursor-not-allowed' : 'bg-red-800 hover:bg-red-900 border border-red-700/50'}`}>
                          {isProcessing ? 'Processing...' : 'Finalize All Rotations'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'watermark' && activeFile && (
                  <div className="max-w-xl mx-auto mb-8">
                    <div className="mb-6 text-left">
                      <label className="block text-xs font-black text-zinc-500 uppercase tracking-widest mb-2">Overlay Identity</label>
                      <input 
                        type="text" 
                        value={watermarkText} 
                        onChange={(e) => setWatermarkText(e.target.value)} 
                        placeholder="e.g., CONFIDENTIAL" 
                        className="w-full p-4 bg-zinc-950 border border-zinc-800 rounded-xl focus:ring-2 focus:ring-red-900/50 outline-none uppercase font-bold text-zinc-200 tracking-wider" 
                      />
                    </div>
                    <button 
                      onClick={handleWatermark} 
                      disabled={isProcessing || !watermarkText.trim()} 
                      className={`w-full py-4 px-6 rounded-xl font-bold text-zinc-100 shadow-lg shadow-red-900/20 transition-all ${isProcessing || !watermarkText.trim() ? 'bg-zinc-800 text-zinc-600 border border-zinc-700 cursor-not-allowed' : 'bg-red-800 hover:bg-red-900 border border-red-700/50'}`}
                    >
                      {isProcessing ? 'Stamping Watermark...' : 'Set Watermark & Download'}
                    </button>
                  </div>
                )}

                {activeTab === 'page-numbers' && activeFile && (
                  <div className="max-w-xl mx-auto mb-8 text-center">
                    <p className="text-zinc-500 mb-6 font-bold uppercase text-[10px] tracking-widest italic opacity-60">Page numbers will be added to the footer of every page.</p>
                    <button 
                      onClick={handlePageNumbers} 
                      disabled={isProcessing} 
                      className={`w-full py-4 px-6 rounded-xl font-bold text-zinc-100 shadow-lg shadow-red-900/20 transition-all ${isProcessing ? 'bg-zinc-800 text-zinc-600 border border-zinc-700 cursor-not-allowed' : 'bg-red-800 hover:bg-red-900 border border-red-700/50'}`}
                    >
                      {isProcessing ? 'Stamping Serializer...' : 'Finalize Sequence & Download'}
                    </button>
                  </div>
                )}  
              </>
            )}
          </div>
        )}
      </div>
      {/* DODO PAYMENTS SUPPORT SECTION */}
      <div className="mt-12 py-10 border-t border-zinc-900 w-full max-w-xl text-center">
        <h3 className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.5em] mb-4">
          Support My Journey
        </h3>
        <p className="text-zinc-500 text-sm mb-8 px-6 leading-relaxed font-mono italic">
          I made this to be a performance-centric, local-first web app. It is a simple tool, yet it provides 80% of features that the vast majority of PDF users actually require. This workspace will remain free forever, for everyone. Donations are the fuel that allows me to sustain my work as a developer, giving me the freedom to continue building.
        </p>
        <button 
          onClick={handleSupportClick}
          className="bg-zinc-950 border-2 border-red-900/40 text-red-600 px-10 py-4 rounded-2xl font-black uppercase text-xs tracking-[0.2em] hover:bg-red-900/10 hover:border-red-600 transition-all shadow-2xl active:scale-95"
        >
          Get Supporter Key
        </button>
        <p className="mt-4 text-[9px] text-zinc-700 uppercase tracking-widest">
          Secure Bank Transfer Processing // Powered by Dodo
        </p>
      </div>
    </div>
  );
}

export default App;