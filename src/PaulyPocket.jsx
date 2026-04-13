import { useState, useEffect, useRef } from "react";

// ── Data ──────────────────────────────────────────────────────────────────────
const ITEM_ICONS = {
  keys: "🔑", sunglasses: "🕶️", wallet: "👛", phone: "📱",
  airpods: "🎧", charger: "🔌", bag: "👜", water: "💧",
  book: "📖", umbrella: "☂️", laptop: "💻", camera: "📷",
};

const INITIAL_ITEMS = [
  { id: "1", name: "Keys",       category: "keys",       important: true,  archived: false },
  { id: "2", name: "Sunglasses", category: "sunglasses", important: false, archived: false },
  { id: "3", name: "Wallet",     category: "wallet",     important: true,  archived: false },
  { id: "4", name: "AirPods",    category: "airpods",    important: false, archived: false },
  { id: "5", name: "Charger",    category: "charger",    important: false, archived: false },
  { id: "6", name: "Tote Bag",   category: "bag",        important: false, archived: false },
];

const INITIAL_LOCATIONS = [
  { id: "l1", name: "Home",   type: "home",   notes: "Entry table",    lat: 48.13, lng: 11.58 },
  { id: "l2", name: "Office", type: "work",   notes: "Desk drawer",    lat: 48.14, lng: 11.57 },
  { id: "l3", name: "Café",   type: "cafe",   notes: "Window seat",    lat: 48.135,lng: 11.575 },
];

const now = () => new Date();
const fmtTime = (d) => {
  if (!d) return "—";
  const diff = Math.floor((now() - new Date(d)) / 60000);
  if (diff < 1)  return "just now";
  if (diff < 60) return `${diff}m ago`;
  if (diff < 1440) return `${Math.floor(diff/60)}h ago`;
  return new Date(d).toLocaleDateString("en-GB", { day:"numeric", month:"short" });
};

function initStates(items, locations) {
  // seed: keys+wallet at Home, sunglasses+charger at Office, rest at Home
  const states = {};
  items.forEach(item => {
    const locId = ["2"].includes(item.id) ? "l2" : "l1";
    states[item.id] = {
      locationId: locId,
      lastSeenAt: new Date(Date.now() - Math.random()*3600000*5).toISOString(),
      confidence: locId === "l1" ? "high" : "medium",
      source: "manual",
      note: "",
    };
  });
  return states;
}

function initHistory(items, locations) {
  return [
    { id:"h1", itemId:"1", locationId:"l1", ts: new Date(Date.now()-8*3600000).toISOString(), type:"manual" },
    { id:"h2", itemId:"3", locationId:"l1", ts: new Date(Date.now()-8*3600000).toISOString(), type:"manual" },
    { id:"h3", itemId:"2", locationId:"l3", ts: new Date(Date.now()-3*3600000).toISOString(), type:"exit_prompt" },
    { id:"h4", itemId:"2", locationId:"l2", ts: new Date(Date.now()-1*3600000).toISOString(), type:"exit_prompt" },
  ];
}

// ── Confidence badge ──────────────────────────────────────────────────────────
function ConfBadge({ level }) {
  const map = { high: ["#b8f0c8","#1a6b36","●●●"], medium: ["#fef3c0","#92620a","●●○"], low: ["#fde0e0","#922a2a","●○○"] };
  const [bg, fg, dots] = map[level] || map.low;
  return (
    <span style={{ background: bg, color: fg, fontSize: 10, fontWeight: 700,
      padding: "2px 7px", borderRadius: 99, letterSpacing: 1, fontFamily: "monospace" }}>
      {dots}
    </span>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function PaulyPocket() {
  const [tab, setTab]             = useState("home");
  const [items, setItems]         = useState(INITIAL_ITEMS);
  const [locations, setLocations] = useState(INITIAL_LOCATIONS);
  const [states, setStates]       = useState(() => initStates(INITIAL_ITEMS, INITIAL_LOCATIONS));
  const [history, setHistory]     = useState(() => initHistory(INITIAL_ITEMS, INITIAL_LOCATIONS));
  const [search, setSearch]       = useState("");
  const [exitModal, setExitModal] = useState(null);  // { locationId, checkedIds }
  const [detailItem, setDetailItem]     = useState(null);
  const [detailLocation, setDetailLocation] = useState(null);
  const [addItemOpen, setAddItemOpen]   = useState(false);
  const [addLocOpen, setAddLocOpen]     = useState(false);
  const [newItemName, setNewItemName]   = useState("");
  const [newItemCat, setNewItemCat]     = useState("keys");
  const [newLocName, setNewLocName]     = useState("");
  const [newLocType, setNewLocType]     = useState("home");
  const [toast, setToast]         = useState(null);

  const showToast = (msg) => { setToast(msg); setTimeout(()=>setToast(null),2500); };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const getState  = (itemId) => states[itemId];
  const getItem   = (id) => items.find(i=>i.id===id);
  const getLoc    = (id) => locations.find(l=>l.id===id);
  const itemsAtLoc = (locId) => items.filter(i => !i.archived && getState(i.id)?.locationId === locId);

  const moveItem = (itemId, locationId, source="manual") => {
    const ts = now().toISOString();
    setStates(s => ({ ...s, [itemId]: { locationId, lastSeenAt: ts, confidence:"high", source, note:"" }}));
    setHistory(h => [{ id:"h"+Date.now(), itemId, locationId, ts, type: source }, ...h]);
  };

  const triggerExitPrompt = (locationId) => {
    const relevant = itemsAtLoc(locationId);
    if (!relevant.length) { showToast("No tracked items at this location"); return; }
    setExitModal({ locationId, checkedIds: relevant.map(i=>i.id) });
  };

  const confirmExit = () => {
    const { locationId, checkedIds } = exitModal;
    // items checked = taken with me → move to "with me" (no location, or keep current)
    // items NOT checked = left behind → stay at location (already are)
    // For MVP: checked items → mark as "with me" (no fixed location), unchecked stay
    // We simulate "with me" as a virtual location
    const withMe = items.filter(i => checkedIds.includes(i.id) && getState(i.id)?.locationId === locationId);
    withMe.forEach(item => {
      // keep location but update confidence + source
      const ts = now().toISOString();
      setStates(s => ({ ...s, [item.id]: { ...s[item.id], confidence:"high", lastSeenAt: ts, source:"exit_prompt" }}));
      setHistory(h => [{ id:"h"+Date.now(), itemId:item.id, locationId, ts, type:"exit_confirmed_taken" }, ...h]);
    });
    showToast("✓ Updated! Safe travels.");
    setExitModal(null);
  };

  // ── Search ─────────────────────────────────────────────────────────────────
  const q = search.toLowerCase().trim();
  const matchedItems = q
    ? items.filter(i => !i.archived && (i.name.toLowerCase().includes(q) || i.category.includes(q)))
    : [];
  const matchedLocs = q
    ? locations.filter(l => l.name.toLowerCase().includes(q))
    : [];

  // ── Add item ───────────────────────────────────────────────────────────────
  const addItem = () => {
    if (!newItemName.trim()) return;
    const id = "i"+Date.now();
    const item = { id, name: newItemName.trim(), category: newItemCat, important: false, archived: false };
    setItems(i => [...i, item]);
    setStates(s => ({ ...s, [id]: { locationId:"l1", lastSeenAt: now().toISOString(), confidence:"medium", source:"manual", note:"" }}));
    setNewItemName(""); setAddItemOpen(false);
    showToast(`✓ ${item.name} added`);
  };

  const addLocation = () => {
    if (!newLocName.trim()) return;
    const id = "l"+Date.now();
    setLocations(l => [...l, { id, name: newLocName.trim(), type: newLocType, notes:"", lat:0, lng:0 }]);
    setNewLocName(""); setAddLocOpen(false);
    showToast(`✓ ${newLocName.trim()} added`);
  };

  // ── Render tabs ────────────────────────────────────────────────────────────
  return (
    <div style={S.app}>
      <style>{CSS}</style>

      {/* Header */}
      <div style={S.header}>
        <div style={S.headerLeft}>
          <span style={S.logo}>🪴</span>
          <span style={S.appName}>Pauly Pocket</span>
        </div>
        <span style={S.tagline}>Never lose track again.</span>
      </div>

      {/* Tab content */}
      <div style={S.content}>
        {tab === "home"     && <HomeTab {...{items, locations, states, search, setSearch, matchedItems, matchedLocs,
          getState, getLoc, getItem, itemsAtLoc, triggerExitPrompt, setDetailItem, setDetailLocation, moveItem, showToast}} />}
        {tab === "items"    && <ItemsTab {...{items, states, locations, getState, getLoc, setDetailItem, setAddItemOpen, showToast}} />}
        {tab === "places"   && <PlacesTab {...{locations, itemsAtLoc, items, triggerExitPrompt, setDetailLocation, setAddLocOpen}} />}
        {tab === "history"  && <HistoryTab {...{history, getItem, getLoc}} />}
      </div>

      {/* Bottom nav */}
      <nav style={S.nav}>
        {[["home","🏠","Home"],["items","🏷️","Items"],["places","📍","Places"],["history","📋","History"]].map(([t,icon,label])=>(
          <button key={t} style={{...S.navBtn, ...(tab===t?S.navBtnActive:{})}} onClick={()=>setTab(t)}>
            <span style={S.navIcon}>{icon}</span>
            <span style={S.navLabel}>{label}</span>
          </button>
        ))}
      </nav>

      {/* Exit prompt modal */}
      {exitModal && (
        <Modal onClose={()=>setExitModal(null)}>
          <ExitModal {...{exitModal, setExitModal, items, itemsAtLoc, confirmExit, showToast}} />
        </Modal>
      )}

      {/* Item detail modal */}
      {detailItem && (
        <Modal onClose={()=>setDetailItem(null)}>
          <ItemDetail item={detailItem} state={getState(detailItem.id)}
            location={getLoc(getState(detailItem.id)?.locationId)}
            locations={locations} history={history} moveItem={moveItem}
            onClose={()=>setDetailItem(null)} showToast={showToast}
            setItems={setItems} items={items} />
        </Modal>
      )}

      {/* Location detail modal */}
      {detailLocation && (
        <Modal onClose={()=>setDetailLocation(null)}>
          <LocationDetail location={detailLocation} itemsAtLoc={itemsAtLoc}
            items={items} getState={getState} triggerExitPrompt={triggerExitPrompt}
            onClose={()=>setDetailLocation(null)} setDetailItem={setDetailItem} />
        </Modal>
      )}

      {/* Add item modal */}
      {addItemOpen && (
        <Modal onClose={()=>setAddItemOpen(false)}>
          <div style={S.modalInner}>
            <h3 style={S.modalTitle}>Add Item</h3>
            <input style={S.input} placeholder="Item name…" value={newItemName}
              onChange={e=>setNewItemName(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&addItem()} autoFocus />
            <div style={{marginBottom:12}}>
              <div style={S.label}>Category</div>
              <div style={S.iconGrid}>
                {Object.entries(ITEM_ICONS).map(([k,v])=>(
                  <button key={k} style={{...S.iconBtn,...(newItemCat===k?S.iconBtnActive:{})}}
                    onClick={()=>setNewItemCat(k)}>{v}</button>
                ))}
              </div>
            </div>
            <button style={S.btnPrimary} onClick={addItem}>Add Item</button>
          </div>
        </Modal>
      )}

      {/* Add location modal */}
      {addLocOpen && (
        <Modal onClose={()=>setAddLocOpen(false)}>
          <div style={S.modalInner}>
            <h3 style={S.modalTitle}>Add Place</h3>
            <input style={S.input} placeholder="Place name…" value={newLocName}
              onChange={e=>setNewLocName(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&addLocation()} autoFocus />
            <div style={{marginBottom:12}}>
              <div style={S.label}>Type</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {[["home","🏠"],["work","🏢"],["cafe","☕"],["gym","🏋️"],["car","🚗"],["other","📍"]].map(([k,v])=>(
                  <button key={k} style={{...S.chipBtn,...(newLocType===k?S.chipBtnActive:{})}}
                    onClick={()=>setNewLocType(k)}>{v} {k}</button>
                ))}
              </div>
            </div>
            <button style={S.btnPrimary} onClick={addLocation}>Add Place</button>
          </div>
        </Modal>
      )}

      {/* Toast */}
      {toast && <div style={S.toast}>{toast}</div>}
    </div>
  );
}

// ── Home Tab ──────────────────────────────────────────────────────────────────
function HomeTab({ items, locations, states, search, setSearch, matchedItems, matchedLocs,
  getState, getLoc, getItem, itemsAtLoc, triggerExitPrompt, setDetailItem, setDetailLocation, moveItem, showToast }) {

  const importantItems = items.filter(i => i.important && !i.archived);
  const recentItems = items.filter(i => !i.archived).slice(0,4);

  return (
    <div style={S.tab}>
      {/* Search */}
      <div style={S.searchWrap}>
        <span style={S.searchIcon}>🔍</span>
        <input style={S.searchInput} placeholder="Where are my keys?" value={search}
          onChange={e=>setSearch(e.target.value)} />
        {search && <button style={S.searchClear} onClick={()=>setSearch("")}>✕</button>}
      </div>

      {/* Search results */}
      {search ? (
        <div>
          {matchedItems.length > 0 && (
            <div>
              <div style={S.sectionTitle}>Items</div>
              {matchedItems.map(item => {
                const st = getState(item.id);
                const loc = getLoc(st?.locationId);
                return (
                  <div key={item.id} style={S.card} onClick={()=>setDetailItem(item)}>
                    <span style={S.cardIcon}>{ITEM_ICONS[item.category]||"📦"}</span>
                    <div style={S.cardBody}>
                      <div style={S.cardName}>{item.name}</div>
                      <div style={S.cardSub}>{loc ? `📍 ${loc.name}` : "Unknown"} · {fmtTime(st?.lastSeenAt)}</div>
                    </div>
                    <ConfBadge level={st?.confidence} />
                  </div>
                );
              })}
            </div>
          )}
          {matchedLocs.length > 0 && (
            <div>
              <div style={S.sectionTitle}>Places</div>
              {matchedLocs.map(loc => (
                <div key={loc.id} style={S.card} onClick={()=>setDetailLocation(loc)}>
                  <span style={S.cardIcon}>📍</span>
                  <div style={S.cardBody}>
                    <div style={S.cardName}>{loc.name}</div>
                    <div style={S.cardSub}>{itemsAtLoc(loc.id).length} items here</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!matchedItems.length && !matchedLocs.length && (
            <div style={S.emptyState}>Nothing found for "{search}"</div>
          )}
        </div>
      ) : (
        <>
          {/* Quick exit simulator */}
          <div style={S.sectionTitle}>Simulate leaving a place</div>
          <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:4}}>
            {locations.map(loc=>(
              <button key={loc.id} style={S.pillBtn} onClick={()=>triggerExitPrompt(loc.id)}>
                🚪 Leave {loc.name}
              </button>
            ))}
          </div>

          {/* Important items */}
          <div style={S.sectionTitle}>Important items</div>
          {importantItems.map(item => {
            const st = getState(item.id);
            const loc = getLoc(st?.locationId);
            return (
              <div key={item.id} style={{...S.card, borderLeft:"3px solid #ff6b35"}} onClick={()=>setDetailItem(item)}>
                <span style={S.cardIcon}>{ITEM_ICONS[item.category]||"📦"}</span>
                <div style={S.cardBody}>
                  <div style={S.cardName}>{item.name} <span style={{fontSize:10,color:"#ff6b35"}}>★ important</span></div>
                  <div style={S.cardSub}>{loc ? `📍 ${loc.name}` : "Unknown"} · {fmtTime(st?.lastSeenAt)}</div>
                </div>
                <ConfBadge level={st?.confidence} />
              </div>
            );
          })}

          {/* Recent items */}
          <div style={S.sectionTitle}>Recent items</div>
          {recentItems.map(item => {
            const st = getState(item.id);
            const loc = getLoc(st?.locationId);
            return (
              <div key={item.id} style={S.card} onClick={()=>setDetailItem(item)}>
                <span style={S.cardIcon}>{ITEM_ICONS[item.category]||"📦"}</span>
                <div style={S.cardBody}>
                  <div style={S.cardName}>{item.name}</div>
                  <div style={S.cardSub}>{loc ? `📍 ${loc.name}` : "Unknown"} · {fmtTime(st?.lastSeenAt)}</div>
                </div>
                <ConfBadge level={st?.confidence} />
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

// ── Items Tab ─────────────────────────────────────────────────────────────────
function ItemsTab({ items, states, locations, getState, getLoc, setDetailItem, setAddItemOpen }) {
  const active = items.filter(i=>!i.archived);
  return (
    <div style={S.tab}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div style={S.sectionTitle}>All Items ({active.length})</div>
        <button style={S.addBtn} onClick={()=>setAddItemOpen(true)}>+ Add</button>
      </div>
      {active.map(item => {
        const st = getState(item.id);
        const loc = getLoc(st?.locationId);
        return (
          <div key={item.id} style={S.card} onClick={()=>setDetailItem(item)}>
            <span style={S.cardIcon}>{ITEM_ICONS[item.category]||"📦"}</span>
            <div style={S.cardBody}>
              <div style={S.cardName}>{item.name}{item.important && <span style={{fontSize:10,color:"#ff6b35",marginLeft:5}}>★</span>}</div>
              <div style={S.cardSub}>{loc ? `📍 ${loc.name}` : "Unknown"} · {fmtTime(st?.lastSeenAt)}</div>
            </div>
            <ConfBadge level={st?.confidence} />
          </div>
        );
      })}
    </div>
  );
}

// ── Places Tab ────────────────────────────────────────────────────────────────
function PlacesTab({ locations, itemsAtLoc, items, triggerExitPrompt, setDetailLocation, setAddLocOpen }) {
  return (
    <div style={S.tab}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div style={S.sectionTitle}>Saved Places ({locations.length})</div>
        <button style={S.addBtn} onClick={()=>setAddLocOpen(true)}>+ Add</button>
      </div>
      {locations.map(loc => {
        const its = itemsAtLoc(loc.id);
        return (
          <div key={loc.id} style={S.card} onClick={()=>setDetailLocation(loc)}>
            <span style={S.cardIcon}>{locIcon(loc.type)}</span>
            <div style={S.cardBody}>
              <div style={S.cardName}>{loc.name}</div>
              <div style={S.cardSub}>{its.length ? its.map(i=>ITEM_ICONS[i.category]).join(" ") : "No tracked items"}</div>
              {loc.notes && <div style={{fontSize:11,color:"#999",marginTop:2}}>📝 {loc.notes}</div>}
            </div>
            <button style={S.exitBtnSmall} onClick={e=>{e.stopPropagation();triggerExitPrompt(loc.id);}}>🚪</button>
          </div>
        );
      })}
    </div>
  );
}

// ── History Tab ───────────────────────────────────────────────────────────────
function HistoryTab({ history, getItem, getLoc }) {
  return (
    <div style={S.tab}>
      <div style={S.sectionTitle}>Recent changes</div>
      {history.slice(0,30).map(h => {
        const item = getItem(h.itemId);
        const loc  = getLoc(h.locationId);
        if (!item || !loc) return null;
        return (
          <div key={h.id} style={{...S.card, alignItems:"flex-start"}}>
            <span style={S.cardIcon}>{ITEM_ICONS[item.category]||"📦"}</span>
            <div style={S.cardBody}>
              <div style={S.cardName}>{item.name} → {loc.name}</div>
              <div style={S.cardSub}>{fmtTime(h.ts)} · {sourceLabel(h.type)}</div>
            </div>
          </div>
        );
      })}
      {!history.length && <div style={S.emptyState}>No history yet</div>}
    </div>
  );
}

// ── Modals ────────────────────────────────────────────────────────────────────
function Modal({ children, onClose }) {
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e=>e.stopPropagation()}>
        <button style={S.closeBtn} onClick={onClose}>✕</button>
        {children}
      </div>
    </div>
  );
}

function ExitModal({ exitModal, setExitModal, items, itemsAtLoc, confirmExit, showToast }) {
  const locItems = itemsAtLoc(exitModal.locationId);
  const [checked, setChecked] = useState(exitModal.checkedIds);

  const toggle = (id) => setChecked(c => c.includes(id) ? c.filter(x=>x!==id) : [...c, id]);

  return (
    <div style={S.modalInner}>
      <div style={{textAlign:"center",marginBottom:16}}>
        <div style={{fontSize:36,marginBottom:4}}>🚪</div>
        <h3 style={{...S.modalTitle, marginBottom:4}}>Do you have these with you?</h3>
        <p style={{fontSize:13,color:"#888",margin:0}}>Check off what you're taking</p>
      </div>
      {locItems.map(item => (
        <div key={item.id} style={{...S.card, cursor:"pointer"}} onClick={()=>toggle(item.id)}>
          <span style={S.cardIcon}>{ITEM_ICONS[item.category]||"📦"}</span>
          <div style={S.cardBody}><div style={S.cardName}>{item.name}</div></div>
          <div style={{fontSize:22}}>{checked.includes(item.id)?"✅":"⬜"}</div>
        </div>
      ))}
      <div style={{display:"flex",gap:8,marginTop:8}}>
        <button style={{...S.btnPrimary,flex:1}} onClick={()=>{ setExitModal({...exitModal, checkedIds:checked}); confirmExit(); }}>
          ✓ All with me
        </button>
        <button style={{...S.btnSecondary,flex:1}} onClick={()=>setExitModal(null)}>Skip</button>
      </div>
    </div>
  );
}

function ItemDetail({ item, state, location, locations, history, moveItem, onClose, showToast, setItems, items }) {
  const itemHistory = history.filter(h=>h.itemId===item.id).slice(0,5);
  const toggleImportant = () => {
    setItems(its => its.map(i => i.id===item.id ? {...i, important:!i.important} : i));
  };
  return (
    <div style={S.modalInner}>
      <div style={{textAlign:"center",marginBottom:16}}>
        <div style={{fontSize:48,marginBottom:4}}>{ITEM_ICONS[item.category]||"📦"}</div>
        <h3 style={{...S.modalTitle,marginBottom:2}}>{item.name}</h3>
        {state && <ConfBadge level={state.confidence} />}
      </div>

      <div style={S.infoRow}>
        <span style={S.infoLabel}>Last seen at</span>
        <span style={S.infoVal}>{location?.name || "Unknown"}</span>
      </div>
      {location?.notes && (
        <div style={S.infoRow}>
          <span style={S.infoLabel}>Notes</span>
          <span style={S.infoVal}>{location.notes}</span>
        </div>
      )}
      <div style={S.infoRow}>
        <span style={S.infoLabel}>Updated</span>
        <span style={S.infoVal}>{fmtTime(state?.lastSeenAt)}</span>
      </div>
      <div style={S.infoRow}>
        <span style={S.infoLabel}>Source</span>
        <span style={S.infoVal}>{sourceLabel(state?.source)}</span>
      </div>

      <div style={{...S.sectionTitle,marginTop:16}}>Quick move</div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
        {locations.map(loc=>(
          <button key={loc.id}
            style={{...S.chipBtn,...(location?.id===loc.id?S.chipBtnActive:{})}}
            onClick={()=>{ moveItem(item.id, loc.id); showToast(`✓ ${item.name} → ${loc.name}`); onClose(); }}>
            {locIcon(loc.type)} {loc.name}
          </button>
        ))}
      </div>

      <button style={{...S.btnSecondary,width:"100%",marginBottom:8}} onClick={toggleImportant}>
        {item.important ? "★ Remove important flag" : "☆ Mark as important"}
      </button>

      {itemHistory.length > 0 && (
        <>
          <div style={S.sectionTitle}>History</div>
          {itemHistory.map(h => {
            const loc2 = locations.find(l=>l.id===h.locationId);
            return (
              <div key={h.id} style={{fontSize:12,color:"#666",padding:"4px 0",borderBottom:"1px solid #f0f0f0"}}>
                📍 {loc2?.name||"?"} · {fmtTime(h.ts)} · {sourceLabel(h.type)}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

function LocationDetail({ location, itemsAtLoc, items, getState, triggerExitPrompt, onClose, setDetailItem }) {
  const here = itemsAtLoc(location.id);
  return (
    <div style={S.modalInner}>
      <div style={{textAlign:"center",marginBottom:16}}>
        <div style={{fontSize:48,marginBottom:4}}>{locIcon(location.type)}</div>
        <h3 style={{...S.modalTitle,marginBottom:2}}>{location.name}</h3>
        {location.notes && <p style={{fontSize:13,color:"#888",margin:0}}>📝 {location.notes}</p>}
      </div>

      <div style={S.sectionTitle}>Items here ({here.length})</div>
      {here.length ? here.map(item => {
        const st = getState(item.id);
        return (
          <div key={item.id} style={S.card} onClick={()=>{onClose();setDetailItem(item);}}>
            <span style={S.cardIcon}>{ITEM_ICONS[item.category]||"📦"}</span>
            <div style={S.cardBody}>
              <div style={S.cardName}>{item.name}</div>
              <div style={S.cardSub}>{fmtTime(st?.lastSeenAt)}</div>
            </div>
            <ConfBadge level={st?.confidence} />
          </div>
        );
      }) : <div style={S.emptyState}>No items tracked here</div>}

      <button style={{...S.btnPrimary,width:"100%",marginTop:12}}
        onClick={()=>{onClose();triggerExitPrompt(location.id);}}>
        🚪 Simulate leaving {location.name}
      </button>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function locIcon(type) {
  return {home:"🏠",work:"🏢",cafe:"☕",gym:"🏋️",car:"🚗",other:"📍"}[type]||"📍";
}
function sourceLabel(src) {
  return {manual:"manual entry",exit_prompt:"exit check",exit_confirmed_taken:"taken on exit",inferred:"inferred"}[src]||src||"—";
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  app: {
    fontFamily: "'DM Sans', 'Rubik', system-ui, sans-serif",
    background: "#f7f6f3",
    minHeight: "100vh",
    maxWidth: 420,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    position: "relative",
  },
  header: {
    background: "#1a1a2e",
    color: "#fff",
    padding: "14px 20px 12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: { display:"flex", alignItems:"center", gap:8 },
  logo: { fontSize:22 },
  appName: { fontWeight:700, fontSize:18, letterSpacing:"-0.3px", color:"#fff" },
  tagline: { fontSize:11, color:"#888", fontStyle:"italic" },

  content: { flex:1, overflowY:"auto", paddingBottom:72 },
  tab: { padding:"16px 16px 8px" },

  searchWrap: {
    display:"flex", alignItems:"center", gap:8,
    background:"#fff", borderRadius:12, padding:"10px 14px",
    marginBottom:16, boxShadow:"0 1px 4px rgba(0,0,0,0.08)",
  },
  searchIcon: { fontSize:16, flexShrink:0 },
  searchInput: {
    border:"none", outline:"none", flex:1, fontSize:15,
    background:"transparent", fontFamily:"inherit",
  },
  searchClear: { border:"none",background:"none",cursor:"pointer",color:"#aaa",fontSize:14 },

  sectionTitle: {
    fontSize:11, fontWeight:700, letterSpacing:"0.08em",
    textTransform:"uppercase", color:"#aaa", marginBottom:8, marginTop:4,
  },
  card: {
    display:"flex", alignItems:"center", gap:12,
    background:"#fff", borderRadius:12, padding:"12px 14px",
    marginBottom:8, boxShadow:"0 1px 3px rgba(0,0,0,0.06)",
    cursor:"pointer", transition:"transform 0.1s",
  },
  cardIcon: { fontSize:22, flexShrink:0 },
  cardBody: { flex:1, minWidth:0 },
  cardName: { fontWeight:600, fontSize:14, color:"#1a1a2e" },
  cardSub: { fontSize:12, color:"#888", marginTop:1 },

  nav: {
    position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)",
    width:"100%", maxWidth:420,
    background:"#fff", borderTop:"1px solid #eee",
    display:"flex", zIndex:100,
  },
  navBtn: {
    flex:1, border:"none", background:"none", padding:"10px 0",
    display:"flex", flexDirection:"column", alignItems:"center",
    cursor:"pointer", gap:2, color:"#bbb",
  },
  navBtnActive: { color:"#1a1a2e" },
  navIcon: { fontSize:20 },
  navLabel: { fontSize:10, fontWeight:600, letterSpacing:"0.04em" },

  overlay: {
    position:"fixed", inset:0, background:"rgba(0,0,0,0.45)",
    display:"flex", alignItems:"flex-end", zIndex:200,
  },
  modal: {
    background:"#fff", borderRadius:"20px 20px 0 0",
    width:"100%", maxWidth:420, margin:"0 auto",
    padding:"20px 20px 32px", position:"relative",
    maxHeight:"90vh", overflowY:"auto",
  },
  modalInner: {},
  modalTitle: { fontSize:18, fontWeight:700, margin:"0 0 12px", color:"#1a1a2e" },
  closeBtn: {
    position:"absolute", top:14, right:16,
    border:"none", background:"#f0f0f0", borderRadius:99,
    width:28, height:28, cursor:"pointer", fontSize:13, color:"#666",
  },

  input: {
    width:"100%", border:"1.5px solid #e5e5e5", borderRadius:10,
    padding:"10px 12px", fontSize:14, fontFamily:"inherit",
    outline:"none", marginBottom:12, boxSizing:"border-box",
  },
  label: { fontSize:12, fontWeight:600, color:"#888", marginBottom:6 },
  iconGrid: { display:"flex", gap:8, flexWrap:"wrap", marginBottom:12 },
  iconBtn: {
    width:40, height:40, borderRadius:10, border:"1.5px solid #e5e5e5",
    background:"#fafafa", fontSize:20, cursor:"pointer",
  },
  iconBtnActive: { border:"2px solid #1a1a2e", background:"#f0f4ff" },

  btnPrimary: {
    background:"#1a1a2e", color:"#fff", border:"none",
    borderRadius:12, padding:"13px 20px", fontSize:14, fontWeight:600,
    cursor:"pointer", fontFamily:"inherit", width:"100%",
  },
  btnSecondary: {
    background:"#f0f0f0", color:"#444", border:"none",
    borderRadius:12, padding:"13px 20px", fontSize:14, fontWeight:600,
    cursor:"pointer", fontFamily:"inherit",
  },
  addBtn: {
    background:"#1a1a2e", color:"#fff", border:"none",
    borderRadius:8, padding:"6px 14px", fontSize:12, fontWeight:600, cursor:"pointer",
  },
  pillBtn: {
    background:"#fff", border:"1.5px solid #e5e5e5", borderRadius:99,
    padding:"8px 14px", fontSize:12, fontWeight:600, cursor:"pointer",
    whiteSpace:"nowrap", flexShrink:0,
  },
  chipBtn: {
    background:"#f5f5f5", border:"1.5px solid #e5e5e5", borderRadius:8,
    padding:"6px 12px", fontSize:12, fontWeight:600, cursor:"pointer",
  },
  chipBtnActive: { background:"#e8ecff", border:"1.5px solid #1a1a2e", color:"#1a1a2e" },
  exitBtnSmall: {
    background:"#fff3ee", border:"none", borderRadius:8,
    padding:"6px 10px", fontSize:16, cursor:"pointer", flexShrink:0,
  },
  infoRow: {
    display:"flex", justifyContent:"space-between", alignItems:"center",
    padding:"8px 0", borderBottom:"1px solid #f5f5f5",
  },
  infoLabel: { fontSize:12, color:"#aaa", fontWeight:600 },
  infoVal: { fontSize:13, fontWeight:600, color:"#1a1a2e" },

  emptyState: { textAlign:"center", color:"#bbb", fontSize:14, padding:"32px 0" },
  toast: {
    position:"fixed", bottom:80, left:"50%", transform:"translateX(-50%)",
    background:"#1a1a2e", color:"#fff", borderRadius:99,
    padding:"10px 20px", fontSize:13, fontWeight:600,
    zIndex:300, whiteSpace:"nowrap", boxShadow:"0 4px 20px rgba(0,0,0,0.2)",
  },
};

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&display=swap');
  * { box-sizing: border-box; }
  body { margin: 0; background: #f7f6f3; }
  button:active { opacity: 0.8; }
`;
