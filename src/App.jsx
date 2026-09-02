import React, { useState, useEffect } from 'react';
import { PlusCircle, History, FileText, Calendar, Edit2, Timer, Plus, Minus, Check, Camera, Image as ImageIcon, X, Download, Clock, Trash2, AlertCircle, BarChart2, Target, Settings, Upload, Search, AlignLeft } from 'lucide-react';

const DB_NAME = 'TureEliteDB';
const STORE_NAME = 'shifts_elite';

const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const saveShiftToDB = async (shift) => {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).put(shift);
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve(true);
  });
};

const loadShiftsFromDB = async () => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result.sort((a, b) => b.id - a.id));
    request.onerror = () => reject(request.error);
  });
};

const deleteShiftFromDB = async (id) => {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).delete(id);
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve(true);
  });
};

const compressImage = (base64Str, maxWidth = 1200, maxHeight = 1200) => {
  return new Promise((resolve) => {
    let img = new Image();
    img.src = base64Str;
    img.onload = () => {
      let canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      if (width > height) {
        if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; }
      } else {
        if (height > maxHeight) { width *= maxHeight / height; height = maxHeight; }
      }
      canvas.width = width;
      canvas.height = height;
      let ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.7)); 
    };
  });
};

export default function App() {
  const [activeTab, setActiveTab] = useState('add');
  const [shifts, setShifts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingShift, setEditingShift] = useState(null);
  
  const [normaLunara, setNormaLunara] = useState(() => {
    const saved = localStorage.getItem('normaLunara');
    return saved ? parseInt(saved, 10) : 160;
  });

  useEffect(() => {
    loadShiftsFromDB().then(savedShifts => {
      setShifts(savedShifts);
      setIsLoading(false);
    });
  }, []);
  
  useEffect(() => {
    localStorage.setItem('normaLunara', normaLunara.toString());
  }, [normaLunara]);

  const formatDuration = (totalMinutes) => {
    if (!totalMinutes || totalMinutes === 0) return "0h 0m";
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h}h ${m}m`;
  };

  const handleSaveShift = async (shiftData) => {
    let finalShift = editingShift 
      ? { ...shiftData, id: editingShift.id }
      : { ...shiftData, id: Date.now() };

    if (editingShift) {
      setShifts(shifts.map(s => s.id === editingShift.id ? finalShift : s));
    } else {
      setShifts([finalShift, ...shifts]);
    }
    
    await saveShiftToDB(finalShift);
    setEditingShift(null);
    setActiveTab('history');
  };

  const handleEditRequest = (shift) => {
    setEditingShift(shift);
    setActiveTab('add');
  };

  const handleDeleteRequest = async (id) => {
    if (window.confirm("Ștergi definitiv această tură și pozele ei?")) {
      await deleteShiftFromDB(id);
      setShifts(shifts.filter(s => s.id !== id));
    }
  };

  const handleExportCSV = () => {
    if (shifts.length === 0) return alert("Nu există date de exportat.");
    
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "ID,Data Inceput,Data Sfarsit,Nume Tura,Total Minute,Ore Formatate,Observatii\n";
    
    shifts.forEach(shift => {
      const row = [
        shift.id,
        shift.startDate,
        shift.endDate,
        `"${(shift.name || '').replace(/"/g, '""')}"`,
        shift.totalMinutes || 0,
        formatDuration(shift.totalMinutes),
        `"${(shift.notes || '').replace(/"/g, '""')}"`
      ].join(",");
      csvContent += row + "\r\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Ture_Export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const csv = event.target.result;
      const lines = csv.split('\n');
      let importedCount = 0;
      const newShifts = [...shifts];

      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const cols = lines[i].match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g);
        if (cols && cols.length >= 6) {
            const id = parseInt(cols[0], 10);
            if (newShifts.some(s => s.id === id)) continue;
            
            const newShift = {
                id: id || Date.now() + i,
                startDate: cols[1].trim(),
                endDate: cols[2].trim(),
                name: cols[3].replace(/(^"|"$)/g, '').replace(/""/g, '"').trim(),
                totalMinutes: parseInt(cols[4], 10) || 0,
                notes: cols[6] ? cols[6].replace(/(^"|"$)/g, '').replace(/""/g, '"').trim() : '',
                timesheets: [] 
            };
            newShifts.push(newShift);
            await saveShiftToDB(newShift);
            importedCount++;
        }
      }
      
      if(importedCount > 0) {
        setShifts(newShifts.sort((a, b) => b.id - a.id));
        alert(`S-au importat cu succes ${importedCount} ture!`);
      } else {
        alert("Nu s-au găsit date noi de importat sau format incorect.");
      }
    };
    reader.readAsText(file);
  };

  if (isLoading) {
    return <div className="h-screen flex items-center justify-center bg-slate-900 text-white font-bold">Se încarcă aplicația...</div>;
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-900 font-sans text-slate-800 dark:text-slate-200 max-w-md mx-auto shadow-2xl relative overflow-hidden print-container transition-colors duration-300">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { background: white !important; color: black !important; }
          .print-container { height: auto; max-width: 100%; box-shadow: none; overflow: visible; background: white !important;}
          main { overflow: visible !important; padding-bottom: 0 !important; background: white !important;}
          * { color: black !important; }
        }
        .glass-header {
          background: rgba(30, 58, 138, 0.95);
          backdrop-filter: blur(10px);
        }
        .dark .glass-header {
          background: rgba(15, 23, 42, 0.95);
        }
      `}</style>

      <header className={`glass-header text-white p-5 shadow-lg z-10 no-print transition-colors border-b border-blue-900 dark:border-slate-800 ${editingShift ? 'bg-amber-600/95 border-amber-700' : ''}`}>
        <div className="flex justify-between items-center mb-1">
          <h1 className="text-2xl font-black tracking-tight bg-gradient-to-r from-blue-300 to-blue-100 bg-clip-text text-transparent">
            {editingShift ? 'Editare Tură' : 'Orele Mele Elite'}
          </h1>
          {!editingShift && (
            <button onClick={() => setActiveTab('settings')} className="h-8 w-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center hover:bg-white/20 transition-colors">
               <Settings size={16} className="text-blue-100"/>
            </button>
          )}
        </div>
        <p className="text-blue-200/80 text-xs font-medium">
          {editingShift ? 'Actualizează datele înregistrate' : 'Management profesional al timpului de lucru'}
        </p>
      </header>

      <main className="flex-1 overflow-y-auto p-4 pb-28 z-0 bg-slate-100 dark:bg-slate-950 transition-colors duration-300">
        {activeTab === 'add' && <ShiftFormTab onSave={handleSaveShift} initialData={editingShift} />}
        {activeTab === 'history' && <HistoryTab shifts={shifts} formatDuration={formatDuration} onEdit={handleEditRequest} onDelete={handleDeleteRequest} normaLunara={normaLunara} />}
        {activeTab === 'report' && <ReportTab shifts={shifts} formatDuration={formatDuration} />}
        {activeTab === 'settings' && <SettingsTab normaLunara={normaLunara} setNormaLunara={setNormaLunara} onExport={handleExportCSV} onImport={handleImportCSV} shiftCount={shifts.length} />}
      </main>

      <nav className="absolute bottom-0 w-full bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex justify-around p-2 pb-6 shadow-[0_-15px_30px_rgba(0,0,0,0.08)] z-20 no-print rounded-t-3xl transition-colors duration-300">
        <NavButton icon={<PlusCircle size={24} />} label="Adaugă" isActive={activeTab === 'add' && !editingShift} onClick={() => {setEditingShift(null); setActiveTab('add');}} />
        <NavButton icon={<History size={24} />} label="Istoric" isActive={activeTab === 'history'} onClick={() => setActiveTab('history')} />
        <NavButton icon={<BarChart2 size={24} />} label="Rapoarte" isActive={activeTab === 'report'} onClick={() => setActiveTab('report')} />
      </nav>
    </div>
  );
}

function ShiftFormTab({ onSave, initialData }) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [timesheets, setTimesheets] = useState([]);
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [isProcessingImg, setIsProcessingImg] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (initialData) {
      setStartDate(initialData.startDate);
      setEndDate(initialData.endDate);
      setName(initialData.name || '');
      setNotes(initialData.notes || '');
      setTimesheets(initialData.timesheets?.length ? initialData.timesheets : [{ id: Date.now(), startTime: '', endTime: '', photo: null }]);
      setHours(Math.floor(initialData.totalMinutes / 60) || '');
      setMinutes(initialData.totalMinutes % 60 || (Math.floor(initialData.totalMinutes / 60) > 0 ? 0 : ''));
    } else {
      const today = new Date().toISOString().split('T')[0];
      setStartDate(today);
      setEndDate(today);
      setName('');
      setNotes('');
      setTimesheets([{ id: Date.now(), startTime: '', endTime: '', photo: null }]);
      setHours('');
      setMinutes('');
    }
  }, [initialData]);

  const handleTimesheetChange = (id, field, value) => {
    setTimesheets(timesheets.map(ts => ts.id === id ? { ...ts, [field]: value } : ts));
  };

  const handlePhotoUpload = (e, id) => {
    const file = e.target.files[0];
    if (file) {
      setIsProcessingImg(true);
      const reader = new FileReader();
      reader.onloadend = async () => {
        const compressedBase64 = await compressImage(reader.result);
        handleTimesheetChange(id, 'photo', compressedBase64);
        setIsProcessingImg(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const submitForm = (e) => {
    e.preventDefault();
    if (!startDate) return alert("Selectează data de început!");
    setShowSuccess(true);
    setTimeout(() => {
      onSave({ 
        startDate, endDate, 
        name: name || 'Tură nespecificată', 
        notes,
        timesheets, 
        totalMinutes: (Number(hours) || 0) * 60 + (Number(minutes) || 0)
      });
      setShowSuccess(false);
    }, 500);
  };

  return (
    <div className="animate-fade-in space-y-5">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-md border border-slate-200 dark:border-slate-800 p-5 overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-500 to-indigo-600"></div>
        <form onSubmit={submitForm} className="space-y-6 pt-2">
          
          <div className="space-y-3">
             <div className="flex gap-3">
               <div className="flex-1">
                 <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Data Început</label>
                 <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); if (startDate === endDate) setEndDate(e.target.value); }} className="w-full px-3 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-bold text-slate-700 dark:text-slate-200 text-xs focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 transition-all dark:[color-scheme:dark]" />
               </div>
               <div className="flex-1">
                 <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Data Sfârșit</label>
                 <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-3 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-bold text-slate-700 dark:text-slate-200 text-xs focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 transition-all dark:[color-scheme:dark]" />
               </div>
             </div>
             
             <div>
               <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Numele Turei / Trenului</label>
               <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: 11190" className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-black text-slate-800 dark:text-white text-lg focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 transition-all" />
             </div>

             <div>
               <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1 flex items-center gap-1">
                 <AlignLeft size={12}/> Observații / Notițe (Opțional)
               </label>
               <textarea 
                 value={notes} 
                 onChange={(e) => setNotes(e.target.value)} 
                 placeholder="Ex: Întârzieri, defectări, alte detalii..." 
                 rows="2"
                 className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-medium text-slate-800 dark:text-slate-200 text-sm focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 transition-all resize-none"
               />
             </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
              <span className="flex items-center gap-1.5"><FileText size={16} className="text-blue-500"/> Foi de parcurs</span>
            </h3>

            {timesheets.map((ts, index) => (
              <div key={ts.id} className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-3 relative">
                {timesheets.length > 1 && (
                  <button type="button" onClick={() => timesheets.length > 1 && setTimesheets(timesheets.filter(t => t.id !== ts.id))} className="absolute top-4 right-4 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"><Trash2 size={16} /></button>
                )}
                <h4 className="text-[10px] font-bold text-slate-400 uppercase">Foaia #{index + 1}</h4>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Ora Înc. (Opt)</label>
                    <input type="time" value={ts.startTime} onChange={(e) => handleTimesheetChange(ts.id, 'startTime', e.target.value)} className="w-full px-2 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-bold text-slate-700 dark:text-slate-200 text-center text-sm focus:border-blue-300 dark:focus:border-blue-700 dark:[color-scheme:dark]" />
                  </div>
                  <div className="flex-1">
                    <label className="block text
