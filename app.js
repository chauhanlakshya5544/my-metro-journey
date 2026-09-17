import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://ratvocmoyqwietodqdef.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Z5PDPxzqmSB4KUuTfmkpFA_udMH-dJT";
const configured = !SUPABASE_URL.startsWith("YOUR_") && !SUPABASE_PUBLISHABLE_KEY.startsWith("YOUR_");
const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY) : null;
const $ = id => document.getElementById(id);
const money = n => `₹${Number(n || 0).toFixed(2)}`;
const fmtDate = d => new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", {weekday:"short",day:"2-digit",month:"short",year:"numeric"});
const fmtTime = t => String(t || "").slice(0,5);
const fmtUpdated = iso => new Date(iso).toLocaleString("en-IN", {day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"});
const show = (el, yes=true) => el.classList.toggle("hidden", !yes);
const ROUTE_STATIONS = [
  ["Dwarka Mor","Blue Line"],["Nawada","Blue Line"],["Uttam Nagar West","Blue Line"],["Uttam Nagar East","Blue Line"],["Janak Puri West","Blue Line"],["Janak Puri East","Blue Line"],["Tilak Nagar","Blue Line"],["Subhash Nagar","Blue Line"],["Tagore Garden","Blue Line"],["Rajouri Garden","Blue Line"],["Ramesh Nagar","Blue Line"],["Moti Nagar","Blue Line"],["Kirti Nagar","Blue Line"],["Shadipur","Blue Line"],["Patel Nagar","Blue Line"],["Rajendra Place","Blue Line"],["Karol Bagh","Blue Line"],["Jhandewalan","Blue Line"],["R K Ashram Marg","Blue Line"],["Rajiv Chowk","Blue Line / Yellow Line"],["New Delhi","Yellow Line"],["Chawri Bazar","Yellow Line"],["Chandni Chowk","Yellow Line"],["Kashmere Gate","Yellow Line"],["Civil Lines","Yellow Line"],["Vidhan Sabha","Yellow Line"],["Vishwavidyalaya","Yellow Line"]
];
let currentRole=null, currentUser=null, cachedTrips=[], lastSeenTripId=null;
let locationWatchId=null, locationSharing=false, parentMap=null, parentMarker=null, parentPollId=null;
const LIVE_STALE_MS = 90000;
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function buildRoute(){
  $("routeStations").innerHTML=ROUTE_STATIONS.map((s,i)=>`<div class="route-stop"><span class="route-num">${i+1}</span><span><strong>${escapeHtml(s[0])}</strong><small>${escapeHtml(s[1])}</small></span>${s[0]==="Rajiv Chowk"?'<em>CHANGE</em>':''}</div>`).join("");
  $("station").innerHTML='<option value="">Select station</option>'+ROUTE_STATIONS.map(s=>`<option value="${escapeHtml(s[0])}">${escapeHtml(s[0])} — ${escapeHtml(s[1])}</option>`).join("")+'<option value="Other">Other</option>';
}
async function getProfile(userId){const {data,error}=await supabase.from("profiles").select("role,display_name").eq("id",userId).single();if(error)throw error;return data;}
async function loadDashboard(initial=false){
  const {data:{user}}=await supabase.auth.getUser();if(!user)return;currentUser=user;
  const profile=await getProfile(user.id);currentRole=profile.role;
  show($("loginView"),false);show($("appView"),true);show($("adminPanel"),currentRole==="owner");show($("exportBtn"),currentRole==="owner");show($("logoutBtn"),true);
  show($("parentNotifyBox"),currentRole==="parent");show($("liveOwnerPanel"),currentRole==="owner");show($("liveParentPanel"),currentRole==="parent");
  if(initial)lastSeenTripId=null;await loadTrips(!initial&&currentRole==="parent");
  if(currentRole==="owner") await loadOwnerLocationState();
  if(currentRole==="parent") await startParentLocationPolling();
}
async function loadTrips(notifyParent=false){
  const {data,error}=await supabase.from("trips").select("id,trip_date,trip_time,status,station,fare,balance_after,note,created_at,owner_id").order("trip_date",{ascending:false}).order("trip_time",{ascending:false}).order("created_at",{ascending:false});
  if(error){$("historyGroups").innerHTML=`<p class="error">Could not load trips: ${escapeHtml(error.message)}</p>`;return;}
  cachedTrips=data||[];updateDateFilter();renderTrips();const newest=cachedTrips[0];
  if(notifyParent&&newest&&lastSeenTripId&&String(newest.id)!==String(lastSeenTripId)&&newest.status==="Reached Vishwavidyalaya") notifyParentAlert(newest);
  if(newest)lastSeenTripId=String(newest.id);
}
function updateDateFilter(){const sel=$("dateFilter"),current=sel.value,dates=[...new Set(cachedTrips.map(t=>t.trip_date))];sel.innerHTML='<option value="all">All dates</option>'+dates.map(d=>`<option value="${d}">${fmtDate(d)}</option>`).join("");sel.value=dates.includes(current)?current:"all";}
function renderTrips(){
  if(!cachedTrips.length){$("historyGroups").innerHTML='<p class="muted">No trips yet.</p>';$('latestStatus').textContent="No update";$('latestStation').textContent="—";$('cardBalance').textContent="—";$('lastUpdated').textContent="—";show($("collegeAlert"),false);return;}
  const latest=cachedTrips[0];$('latestStatus').textContent=latest.status;$('latestStation').textContent=latest.station;$('cardBalance').textContent=money(latest.balance_after);$('lastUpdated').textContent=fmtUpdated(latest.created_at);const reached=latest.status==="Reached Vishwavidyalaya"||latest.station==="Vishwavidyalaya";show($("collegeAlert"),reached);if(reached)$("collegeAlertText").textContent=` — ${fmtDate(latest.trip_date)} at ${fmtTime(latest.trip_time)}`;
  const selected=$("dateFilter").value,filtered=selected==="all"?cachedTrips:cachedTrips.filter(t=>t.trip_date===selected),groups={};filtered.forEach(t=>(groups[t.trip_date]??=[]).push(t));const dates=Object.keys(groups).sort().reverse();
  $("historyGroups").innerHTML=dates.map(date=>`<div class="date-group"><h3>${fmtDate(date)}</h3><div class="table-wrap"><table><thead><tr><th>Time</th><th>Status</th><th>Station</th><th>Fare</th><th>Balance</th><th>Note</th>${currentRole==="owner"?"<th>Action</th>":""}</tr></thead><tbody>${groups[date].map(t=>`<tr><td>${escapeHtml(fmtTime(t.trip_time))}</td><td>${escapeHtml(t.status)}</td><td>${escapeHtml(t.station)}</td><td>${money(t.fare)}</td><td>${money(t.balance_after)}</td><td>${escapeHtml(t.note||"")}</td>${currentRole==="owner"?`<td><button class="danger small delete-btn" data-id="${t.id}">Delete</button></td>`:""}</tr>`).join("")}</tbody></table></div></div>`).join("")||'<p class="muted">No updates for this date.</p>';
  document.querySelectorAll(".delete-btn").forEach(b=>b.addEventListener("click",()=>deleteTrip(b.dataset.id)));
}
async function deleteTrip(id){
  if(currentRole!=="owner"||!confirm("Delete this travel update? This cannot be undone."))return;
  $("saveMsg").textContent="Deleting…";const {data:{user},error:userError}=await supabase.auth.getUser();
  if(userError||!user){$("saveMsg").textContent=`Delete failed: ${userError?.message||"Not signed in."}`;return;}
  const {data:deletedRows,error}=await supabase.from("trips").delete({count:"exact"}).eq("id",id).eq("owner_id",user.id).select("id");
  if(error){$("saveMsg").textContent=`Delete failed: ${error.message}`;alert(`Delete failed.\n\n${error.message}`);return;}
  if(!deletedRows?.length){$("saveMsg").textContent="Delete failed: no matching owner record was deleted.";alert("The update was not deleted. Check the DELETE policy on public.trips.");return;}
  $("saveMsg").textContent="Update deleted.";await loadTrips();
}
function notifyParentAlert(trip){$("collegeAlertText").textContent=` — College reached at ${fmtTime(trip.trip_time)}.`;if("Notification"in window&&Notification.permission==="granted")new Notification("My Metro Journey",{body:`🎓 Vishwavidyalaya reached at ${fmtTime(trip.trip_time)}.`});}

async function getLiveLocation(){
  const {data,error}=await supabase.from("live_locations").select("owner_id,latitude,longitude,accuracy,sharing_enabled,updated_at").eq("owner_id",currentUser.id).maybeSingle();
  if(error){$("liveOwnerMsg").textContent=`Live location setup error: ${error.message}`;return null;}return data;
}
async function loadOwnerLocationState(){
  const row=await getLiveLocation();
  const active=!!row?.sharing_enabled;
  updateOwnerLiveUI(active);
  if(active) startBrowserLocationWatch();
}
function updateOwnerLiveUI(active){
  locationSharing=active;show($("startLiveBtn"),!active);show($("stopLiveBtn"),active);$("liveStatusBadge").textContent=active?"● LIVE":"● OFF";$("liveStatusBadge").className=`live-badge ${active?"on":"off"}`;
}
async function setSharingEnabled(enabled){
  if(!currentUser)return;
  const payload={owner_id:currentUser.id,sharing_enabled:enabled,updated_at:new Date().toISOString()};
  const {error}=await supabase.from("live_locations").upsert(payload,{onConflict:"owner_id"});
  if(error){$("liveOwnerMsg").textContent=`Could not change sharing: ${error.message}`;return false;}return true;
}
function startBrowserLocationWatch(){
  if(locationWatchId!==null)return;
  if(!navigator.geolocation){$("liveOwnerMsg").textContent="This browser does not support GPS location.";return;}
  $("liveOwnerMsg").textContent="Requesting location permission…";
  locationWatchId=navigator.geolocation.watchPosition(async pos=>{
    if(!locationSharing)return;
    const {latitude,longitude,accuracy}=pos.coords;
    const {error}=await supabase.from("live_locations").upsert({owner_id:currentUser.id,latitude,longitude,accuracy,sharing_enabled:true,updated_at:new Date().toISOString()},{onConflict:"owner_id"});
    if(error){$("liveOwnerMsg").textContent=`Location update failed: ${error.message}`;return;}
    $("liveOwnerMsg").textContent=`Live location updated • accuracy ±${Math.round(accuracy||0)} m`;
  },err=>{
    const messages={1:"Location permission was denied. Allow location access in your browser settings.",2:"Your location is temporarily unavailable.",3:"Location request timed out."};
    $("liveOwnerMsg").textContent=messages[err.code]||"Could not get your location.";
  },{enableHighAccuracy:true,maximumAge:10000,timeout:20000});
}
function stopBrowserLocationWatch(){if(locationWatchId!==null){navigator.geolocation.clearWatch(locationWatchId);locationWatchId=null;}}
async function startLiveLocation(){
  if(!navigator.geolocation){$("liveOwnerMsg").textContent="Your browser does not support live GPS location.";return;}
  const ok=await setSharingEnabled(true);if(!ok)return;updateOwnerLiveUI(true);startBrowserLocationWatch();
  $("liveOwnerMsg").textContent="Live sharing is ON. Keep this website active for continuous browser updates.";
}
async function stopLiveLocation(){
  const ok=await setSharingEnabled(false);if(!ok)return;stopBrowserLocationWatch();updateOwnerLiveUI(false);$("liveOwnerMsg").textContent="Live location sharing is OFF.";
}
async function startParentLocationPolling(){
  if(parentPollId)clearInterval(parentPollId);await refreshParentLocation();parentPollId=setInterval(refreshParentLocation,5000);
}
async function refreshParentLocation(){
  const {data,error}=await supabase.from("live_locations").select("latitude,longitude,accuracy,sharing_enabled,updated_at").eq("sharing_enabled",true).order("updated_at",{ascending:false}).limit(1).maybeSingle();
  if(error){$("parentLiveMsg").textContent=`Could not load live location: ${error.message}`;return;}
  if(!data){setParentOffline("Live location is OFF");return;}
  const age=Date.now()-new Date(data.updated_at).getTime();
  if(age>LIVE_STALE_MS){setParentOffline(`No fresh GPS update for ${Math.round(age/1000)} seconds`);return;}
  showParentMap(data.latitude,data.longitude,data.accuracy,data.updated_at);$("parentLiveBadge").textContent="● LIVE";$("parentLiveBadge").className="live-badge on";$("parentLocationText").textContent=`Accuracy ±${Math.round(data.accuracy||0)} m`;$("parentLocationUpdated").textContent=`Updated ${Math.max(0,Math.round(age/1000))} sec ago`;$("parentLiveMsg").textContent="";
}
function setParentOffline(msg){$("parentLiveBadge").textContent="● OFFLINE";$("parentLiveBadge").className="live-badge off";$("parentLocationText").textContent="Location unavailable";$("parentLocationUpdated").textContent="—";$("parentLiveMsg").textContent=msg;if(parentMarker&&parentMap)parentMarker.setOpacity(0);}
function showParentMap(lat,lng,accuracy,updated){
  if(!parentMap){parentMap=L.map("parentLocationMap").setView([lat,lng],15);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap contributors"}).addTo(parentMap);parentMarker=L.marker([lat,lng]).addTo(parentMap);}
  parentMarker.setOpacity(1).setLatLng([lat,lng]).bindPopup(`Live location<br>Accuracy ±${Math.round(accuracy||0)} m`);parentMap.setView([lat,lng],parentMap.getZoom()<13?15:parentMap.getZoom());setTimeout(()=>parentMap.invalidateSize(),50);
}

$("enableNotifyBtn")?.addEventListener("click",async()=>{if(!("Notification"in window)){$("notifyMsg").textContent="This browser does not support browser alerts.";return;}const p=await Notification.requestPermission();$("notifyMsg").textContent=p==="granted"?"Browser alerts enabled.":"Permission not granted.";});
$("startLiveBtn")?.addEventListener("click",startLiveLocation);
$("stopLiveBtn")?.addEventListener("click",stopLiveLocation);
$("dateFilter").addEventListener("change",renderTrips);
$("loginForm").addEventListener("submit",async e=>{e.preventDefault();$("loginMsg").textContent="Signing in…";const {error}=await supabase.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});$("loginMsg").textContent=error?error.message:"";});
$("tripForm").addEventListener("submit",async e=>{e.preventDefault();if(currentRole!=="owner")return;$("saveMsg").textContent="Saving…";const {data:{user}}=await supabase.auth.getUser();const payload={owner_id:user.id,trip_date:$("tripDate").value,trip_time:$("tripTime").value,status:$("tripStatus").value,station:$("station").value,fare:Number($("fare").value||0),balance_after:Number($("balance").value),note:$("note").value.trim()};const {error}=await supabase.from("trips").insert(payload);if(error){$("saveMsg").textContent=error.message;return;}$("saveMsg").textContent="Saved.";$("note").value="";await loadTrips();});
$("refreshBtn").addEventListener("click",()=>loadTrips());$("logoutBtn").addEventListener("click",async()=>{await supabase.auth.signOut();location.reload();});$("exportBtn").addEventListener("click",()=>{const rows=cachedTrips.map(t=>[t.trip_date,fmtTime(t.trip_time),t.status,t.station,t.fare,t.balance_after,t.note||""]);const csv=[["Date","Time","Status","Station","Fare","Balance","Note"],...rows].map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");const blob=new Blob([csv],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="metro-travel-history.csv";a.click();URL.revokeObjectURL(url);});
buildRoute();$("tripDate").value=new Date().toISOString().slice(0,10);$("tripTime").value=new Date().toTimeString().slice(0,5);
(async function init(){if(!configured){show($("setupNotice"),true);return;}show($("setupNotice"),false);const {data:{session}}=await supabase.auth.getSession();if(session){await loadDashboard(true);setInterval(()=>loadDashboard(false),15000);}else show($("loginView"),true);supabase.auth.onAuthStateChange(async(_event,s)=>{if(s)await loadDashboard(true);});})();