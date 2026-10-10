use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};

pub const MAX_RECORDS: usize = 2_000;
pub const MAX_JSON_BYTES: usize = 8 * 1024 * 1024;
pub const MAX_FILE_BYTES: usize = 32 * 1024 * 1024;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Manifest {
    pub schema_version: u8,
    pub label: String,
    pub completeness: String,
    pub records: Vec<Record>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Record {
    pub id: String,
    pub path: String,
    pub size: Option<u64>,
    pub sha256: Option<String>,
    pub path_hash: Option<String>,
    pub kind: String,
    pub original_id: Option<String>,
    pub albums: Option<Vec<String>>,
    pub metadata: Option<BTreeMap<String, String>>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Observation {
    pub id: String,
    pub sha256: String,
    pub size: u64,
}
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub source: Manifest,
    pub destination: Manifest,
    #[serde(default)]
    pub source_observations: Vec<Observation>,
    #[serde(default)]
    pub destination_observations: Vec<Observation>,
}
#[derive(Debug, Serialize)]
pub struct Finding {
    pub id: String,
    pub path: String,
    pub status: String,
    pub reason: String,
    pub candidates: Vec<String>,
    pub candidate_count: usize,
    pub destination_path: Option<String>,
    pub byte_evidence: String,
    pub metadata: String,
    pub albums: String,
    pub relationship: String,
    pub issues: Vec<String>,
}
#[derive(Debug, Serialize)]
pub struct Report {
    pub engine: &'static str,
    pub source_label: String,
    pub destination_label: String,
    pub source_count: usize,
    pub destination_count: usize,
    pub summary: BTreeMap<String, usize>,
    pub findings: Vec<Finding>,
    pub destination_only: Vec<String>,
    pub unknowns: Vec<String>,
    pub manifest_fingerprint: String,
    pub can_recommend_source_deletion: bool,
}
#[derive(Debug, Serialize)]
pub struct Envelope {
    pub report: Option<Report>,
    pub error: Option<String>,
}

fn hash_valid(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|b| b.is_ascii_hexdigit())
}
fn bounded(value: &str, max: usize) -> bool {
    !value.is_empty() && value.len() <= max && !value.chars().any(|c| c.is_control())
}
fn validate(m: &Manifest) -> Result<(), String> {
    if m.schema_version != 1 {
        return Err("Unsupported schema_version. Expected 1.".into());
    }
    if !bounded(&m.label, 100) {
        return Err("Manifest label must be 1–100 bytes without control characters.".into());
    }
    if !["unknown", "partial", "supplied_export"].contains(&m.completeness.as_str()) {
        return Err("Completeness must be unknown, partial, or supplied_export; device completeness cannot be asserted.".into());
    }
    if m.records.len() > MAX_RECORDS {
        return Err("Each manifest is limited to 2,000 records.".into());
    }
    let mut ids = BTreeSet::new();
    for r in &m.records {
        if !bounded(&r.id, 128) || !ids.insert(r.id.clone()) {
            return Err("Record IDs must be unique, nonempty, and at most 128 bytes.".into());
        }
        if !bounded(&r.path, 512)
            || r.path.starts_with('/')
            || r.path.contains('\\')
            || r.path
                .split('/')
                .any(|p| p == ".." || p == "." || p.is_empty())
        {
            return Err(format!(
                "{}: use a relative forward-slash path without traversal or empty segments.",
                r.id
            ));
        }
        if !["original", "edited", "unknown"].contains(&r.kind.as_str()) {
            return Err(format!(
                "{}: kind must be original, edited, or unknown.",
                r.id
            ));
        }
        if r.sha256.as_deref().is_some_and(|s| !hash_valid(s)) {
            return Err(format!(
                "{}: sha256 must contain 64 hexadecimal characters.",
                r.id
            ));
        }
        if r.path_hash.as_deref().is_some_and(|s| !bounded(s, 128)) {
            return Err(format!("{}: invalid path_hash.", r.id));
        }
        if r.original_id
            .as_deref()
            .is_some_and(|s| !bounded(s, 128) || s == r.id)
        {
            return Err(format!("{}: invalid original_id.", r.id));
        }
        if let Some(albums) = &r.albums
            && (albums.len() > 64
                || albums.iter().any(|a| !bounded(a, 128))
                || albums.iter().collect::<BTreeSet<_>>().len() != albums.len())
        {
            return Err(format!(
                "{}: albums must be unique, at most 64 entries of 128 bytes.",
                r.id
            ));
        }
        if let Some(meta) = &r.metadata
            && (meta.len() > 32
                || meta
                    .iter()
                    .any(|(k, v)| !bounded(k, 64) || !bounded(v, 512)))
        {
            return Err(format!(
                "{}: metadata is limited to 32 bounded text fields.",
                r.id
            ));
        }
    }
    Ok(())
}
fn observations(
    m: &Manifest,
    obs: &[Observation],
) -> Result<BTreeMap<String, Observation>, String> {
    if obs.len() > 100 {
        return Err("A side is limited to 100 locally hashed files.".into());
    }
    let records: BTreeMap<_, _> = m.records.iter().map(|r| (r.id.as_str(), r)).collect();
    let mut output = BTreeMap::new();
    let mut total = 0_u64;
    for o in obs {
        if !records.contains_key(o.id.as_str())
            || !hash_valid(&o.sha256)
            || o.size > MAX_FILE_BYTES as u64
            || output.contains_key(&o.id)
        {
            return Err("Invalid or duplicate local byte observation.".into());
        }
        total = total.checked_add(o.size).ok_or("File size overflow.")?;
        if total > 256 * 1024 * 1024 {
            return Err("Local file total exceeds 256 MiB per side.".into());
        }
        output.insert(o.id.clone(), o.clone());
    }
    Ok(output)
}
fn digest<'a>(r: &'a Record, obs: &'a BTreeMap<String, Observation>) -> Option<String> {
    obs.get(&r.id)
        .map(|o| o.sha256.to_ascii_lowercase())
        .or_else(|| r.sha256.as_ref().map(|s| s.to_ascii_lowercase()))
}
fn known_size(r: &Record, obs: &BTreeMap<String, Observation>) -> Option<u64> {
    obs.get(&r.id).map(|o| o.size).or(r.size)
}
fn compare_metadata(s: &Record, d: &Record) -> String {
    match (&s.metadata, &d.metadata) {
        (Some(a), Some(b)) if a.iter().all(|(k, v)| b.get(k) == Some(v)) => "covered",
        (Some(_), Some(_)) => "different",
        _ => "unknown",
    }
    .into()
}
fn compare_albums(s: &Record, d: &Record) -> String {
    match (&s.albums, &d.albums) {
        (Some(a), Some(b)) if a.iter().all(|v| b.contains(v)) => "covered",
        (Some(_), Some(_)) => "missing associations",
        _ => "unknown",
    }
    .into()
}
pub fn reconcile(req: Request) -> Result<Report, String> {
    validate(&req.source)?;
    validate(&req.destination)?;
    let so = observations(&req.source, &req.source_observations)?;
    let ds = observations(&req.destination, &req.destination_observations)?;
    let fingerprint = hash(
        &serde_json::to_vec(&(
            &req.source,
            &req.destination,
            &req.source_observations,
            &req.destination_observations,
        ))
        .map_err(|_| "Could not fingerprint manifests.")?,
    );
    let mut by_hash: BTreeMap<String, Vec<&Record>> = BTreeMap::new();
    let mut by_path: BTreeMap<&str, Vec<&Record>> = BTreeMap::new();
    for d in &req.destination.records {
        if let Some(h) = digest(d, &ds) {
            by_hash.entry(h).or_default().push(d);
        }
        by_path.entry(&d.path).or_default().push(d);
    }
    let mut source_hash_counts: BTreeMap<String, usize> = BTreeMap::new();
    let mut source_path_counts: BTreeMap<&str, usize> = BTreeMap::new();
    for s in &req.source.records {
        if let Some(h) = digest(s, &so) {
            *source_hash_counts.entry(h).or_default() += 1;
        }
        *source_path_counts.entry(&s.path).or_default() += 1;
    }
    // Count candidate claims before assigning any pair. Hash and path lookups
    // must share the same one-to-one constraint, including mixed evidence.
    let mut destination_claims: BTreeMap<&str, usize> = BTreeMap::new();
    for source in &req.source.records {
        let h = digest(source, &so);
        if let Some(candidates) = h
            .as_ref()
            .and_then(|h| by_hash.get(h))
            .or_else(|| by_path.get(source.path.as_str()))
        {
            for destination in candidates {
                *destination_claims
                    .entry(destination.id.as_str())
                    .or_default() += 1;
            }
        }
    }
    let mut findings = Vec::new();
    let mut matched: BTreeMap<String, String> = BTreeMap::new();
    let mut referenced = BTreeSet::new();
    for s in &req.source.records {
        let sh = digest(s, &so);
        let candidates = sh
            .as_ref()
            .and_then(|h| by_hash.get(h))
            .or_else(|| by_path.get(s.path.as_str()))
            .cloned()
            .unwrap_or_default();
        let mut f = Finding {
            id: s.id.clone(),
            path: s.path.clone(),
            status: String::new(),
            reason: String::new(),
            candidates: candidates.iter().take(20).map(|r| r.id.clone()).collect(),
            candidate_count: candidates.len(),
            destination_path: None,
            byte_evidence: "not verified".into(),
            metadata: "unknown".into(),
            albums: "unknown".into(),
            relationship: "unknown".into(),
            issues: vec![],
        };
        for d in &candidates {
            referenced.insert(d.id.clone());
        }
        if candidates.is_empty() {
            f.status = "missing".into();
            f.reason =
                "No matching SHA-256 or exact path in the supplied destination manifest.".into();
        } else if candidates.len() > 1
            || candidates
                .iter()
                .any(|d| destination_claims.get(d.id.as_str()).copied().unwrap_or(0) > 1)
            || sh
                .as_ref()
                .is_some_and(|h| source_hash_counts.get(h).copied().unwrap_or(0) > 1)
            || source_path_counts
                .get(s.path.as_str())
                .copied()
                .unwrap_or(0)
                > 1
        {
            f.status = "ambiguous".into();
            f.reason = format!(
                "{} destination candidate(s), with duplicate content, paths, or competing claims on either side. One-to-one correspondence is not proven; no ambiguity was resolved automatically.",
                candidates.len()
            );
        } else {
            let d = candidates[0];
            f.destination_path = Some(d.path.clone());
            if so.contains_key(&s.id) && ds.contains_key(&d.id) {
                f.byte_evidence = "both selected files hashed locally".into();
            }
            let dh = digest(d, &ds);
            let sizes_conflict = known_size(s, &so)
                .zip(known_size(d, &ds))
                .is_some_and(|(a, b)| a != b);
            let hashes_conflict = sh.as_ref().zip(dh.as_ref()).is_some_and(|(a, b)| a != b);
            if sizes_conflict || hashes_conflict {
                f.status = "changed".into();
                f.reason="The paired records disagree on byte size or SHA-256. This may be a transformation; review the actual files.".into();
            } else if sh.is_some() && sh == dh {
                if so.contains_key(&s.id) && ds.contains_key(&d.id) {
                    f.status = "verified".into();
                    f.byte_evidence = "both selected files hashed locally".into();
                    f.reason="SHA-256 and size agree for bytes actually read on both sides in this session.".into();
                } else {
                    f.status = "reported".into();
                    f.byte_evidence = "manifest-reported SHA-256 agreement".into();
                    f.reason="SHA-256 values agree, but both files have not been read here. Manifest claims are not byte verification.".into();
                }
            } else {
                f.status = "unverified".into();
                f.reason="Only an exact path can be paired. Path hashes and file names are not byte-integrity evidence.".into();
            }
            if f.status != "changed" {
                matched.insert(s.id.clone(), d.id.clone());
            }
            f.metadata = compare_metadata(s, d);
            f.albums = compare_albums(s, d);
            if f.metadata != "covered" {
                f.issues.push(format!("Metadata: {}", f.metadata));
            }
            if f.albums != "covered" {
                f.issues.push(format!("Album associations: {}", f.albums));
            }
            for (label, r, o) in [("Source", s, &so), ("Destination", d, &ds)] {
                if let Some(observed) = o.get(&r.id)
                    && (r
                        .sha256
                        .as_ref()
                        .is_some_and(|h| !h.eq_ignore_ascii_case(&observed.sha256))
                        || r.size.is_some_and(|v| v != observed.size))
                {
                    f.issues.push(format!("{label} manifest disagrees with locally read bytes; observed bytes took precedence."));
                }
            }
        }
        findings.push(f);
    }
    let source_by_id: BTreeMap<_, _> = req.source.records.iter().map(|r| (&r.id, r)).collect();
    let dest_by_id: BTreeMap<_, _> = req.destination.records.iter().map(|r| (&r.id, r)).collect();
    for (s, f) in req.source.records.iter().zip(findings.iter_mut()) {
        if f.candidate_count == 1 && f.status != "ambiguous" {
            let d = dest_by_id[&f.candidates[0]];
            f.relationship =
                if s.kind == "unknown" || d.kind == "unknown" {
                    "unknown"
                } else if s.kind != d.kind {
                    "kind differs"
                } else if s.kind == "original" {
                    if s.original_id.is_none() && d.original_id.is_none() {
                        "covered"
                    } else {
                        "invalid original reference"
                    }
                } else {
                    match (&s.original_id, &d.original_id) {
                        (Some(a), Some(b))
                            if source_by_id.get(a).is_some_and(|r| {
                                r.kind != "original" || r.original_id.is_some()
                            }) || dest_by_id.get(b).is_some_and(|r| {
                                r.kind != "original" || r.original_id.is_some()
                            }) =>
                        {
                            "invalid original reference"
                        }
                        (Some(a), Some(b))
                            if source_by_id.get(a).is_some_and(|r| {
                                r.kind == "original" && r.original_id.is_none()
                            }) && dest_by_id.get(b).is_some_and(|r| {
                                r.kind == "original" && r.original_id.is_none()
                            }) && matched.get(a) == Some(b) =>
                        {
                            "covered"
                        }
                        (Some(_), Some(_)) => "original not reconciled",
                        _ => "unknown",
                    }
                }
                .into();
            if f.relationship != "covered" {
                f.issues
                    .push(format!("Original/edit relationship: {}", f.relationship));
            }
        }
    }
    let mut summary = BTreeMap::new();
    for status in [
        "verified",
        "reported",
        "missing",
        "changed",
        "ambiguous",
        "unverified",
    ] {
        summary.insert(
            status.into(),
            findings.iter().filter(|f| f.status == status).count(),
        );
    }
    summary.insert(
        "needs_review".into(),
        findings
            .iter()
            .filter(|f| f.status != "verified" || !f.issues.is_empty())
            .count(),
    );
    let destination_only = req
        .destination
        .records
        .iter()
        .filter(|r| !referenced.contains(&r.id))
        .map(|r| r.id.clone())
        .collect();
    Ok(Report { engine:"phototrace-core/0.1.0",source_label:req.source.label,destination_label:req.destination.label,source_count:req.source.records.len(),destination_count:req.destination.records.len(),summary,findings,destination_only,unknowns:vec!["Only supplied exports and explicitly selected files are in scope. A complete iPhone Photos or cloud library inventory is not established.".into(),"Picker/export transformations, omitted originals, Live Photo companions, sidecars, and unavailable cloud items may be absent.".into(),"Metadata, album associations, and original/edit relationships are supplied claims; media metadata is not extracted or independently validated.".into(),"Equal bytes do not establish that a destination is durable, backed up, or safe. Never use this report as permission to delete originals.".into()],manifest_fingerprint:fingerprint,can_recommend_source_deletion:false })
}
pub fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
pub fn reconcile_json(input: &str) -> String {
    let result = if input.len() > MAX_JSON_BYTES {
        Err("Combined request exceeds 8 MiB.".into())
    } else {
        serde_json::from_str::<Request>(input)
            .map_err(|e| format!("Invalid manifest JSON: {e}"))
            .and_then(reconcile)
    };
    let envelope = match result {
        Ok(report) => Envelope {
            report: Some(report),
            error: None,
        },
        Err(error) => Envelope {
            report: None,
            error: Some(error),
        },
    };
    serde_json::to_string(&envelope).expect("bounded serializable report")
}
// Raw WASM ABI: the browser wrapper owns all pointer lifetimes and immediately copies output.
#[cfg(target_arch = "wasm32")]
#[unsafe(no_mangle)]
pub extern "C" fn allocate(len: usize) -> *mut u8 {
    if len > MAX_FILE_BYTES {
        return std::ptr::null_mut();
    }
    Box::into_raw(vec![0u8; len].into_boxed_slice()) as *mut u8
}
#[cfg(target_arch = "wasm32")]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn release(ptr: *mut u8, len: usize) {
    if !ptr.is_null() {
        unsafe {
            drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr, len)));
        }
    }
}
#[cfg(target_arch = "wasm32")]
fn output(bytes: Vec<u8>) -> u64 {
    let len = bytes.len();
    let ptr = Box::into_raw(bytes.into_boxed_slice()) as *mut u8;
    ((len as u64) << 32) | (ptr as u64)
}
#[cfg(target_arch = "wasm32")]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn run(ptr: *const u8, len: usize) -> u64 {
    if len > MAX_JSON_BYTES {
        return output(br#"{"report":null,"error":"Request exceeds 8 MiB."}"#.to_vec());
    }
    let bytes = unsafe { std::slice::from_raw_parts(ptr, len) };
    match std::str::from_utf8(bytes) {
        Ok(input) => output(reconcile_json(input).into_bytes()),
        Err(_) => output(br#"{"report":null,"error":"Input is not UTF-8."}"#.to_vec()),
    }
}
#[cfg(target_arch = "wasm32")]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn hash_bytes(ptr: *const u8, len: usize) -> u64 {
    if len > MAX_FILE_BYTES {
        return output(b"error".to_vec());
    }
    output(hash(unsafe { std::slice::from_raw_parts(ptr, len) }).into_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn rec(id: &str, path: &str, h: Option<&str>) -> Record {
        Record {
            id: id.into(),
            path: path.into(),
            size: Some(3),
            sha256: h.map(Into::into),
            path_hash: None,
            kind: "original".into(),
            original_id: None,
            albums: Some(vec![]),
            metadata: Some(BTreeMap::new()),
        }
    }
    fn manifest(records: Vec<Record>) -> Manifest {
        Manifest {
            schema_version: 1,
            label: "Test".into(),
            completeness: "unknown".into(),
            records,
        }
    }
    fn request(s: Vec<Record>, d: Vec<Record>) -> Request {
        Request {
            source: manifest(s),
            destination: manifest(d),
            source_observations: vec![],
            destination_observations: vec![],
        }
    }
    #[test]
    fn hash_known_vector() {
        assert_eq!(
            hash(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }
    #[test]
    fn imported_hash_is_not_verified() {
        let h = hash(b"abc");
        let r = reconcile(request(
            vec![rec("s", "a", Some(&h))],
            vec![rec("d", "b", Some(&h))],
        ))
        .unwrap();
        assert_eq!(r.findings[0].status, "reported");
        assert!(!r.can_recommend_source_deletion);
    }
    #[test]
    fn observed_both_is_verified() {
        let h = hash(b"abc");
        let mut q = request(vec![rec("s", "a", None)], vec![rec("d", "b", None)]);
        q.source_observations.push(Observation {
            id: "s".into(),
            sha256: h.clone(),
            size: 3,
        });
        q.destination_observations.push(Observation {
            id: "d".into(),
            sha256: h,
            size: 3,
        });
        assert_eq!(reconcile(q).unwrap().findings[0].status, "verified");
    }
    #[test]
    fn path_hash_never_verifies() {
        let mut s = rec("s", "a", None);
        s.path_hash = Some(hash(b"abc"));
        let d = s.clone();
        assert_eq!(
            reconcile(request(vec![s], vec![d])).unwrap().findings[0].status,
            "unverified"
        );
    }
    #[test]
    fn absent_is_missing() {
        assert_eq!(
            reconcile(request(vec![rec("s", "a", None)], vec![]))
                .unwrap()
                .findings[0]
                .status,
            "missing"
        );
    }
    #[test]
    fn changed_hash() {
        let a = hash(b"abc");
        let b = hash(b"def");
        assert_eq!(
            reconcile(request(
                vec![rec("s", "a", Some(&a))],
                vec![rec("d", "a", Some(&b))]
            ))
            .unwrap()
            .findings[0]
                .status,
            "changed"
        );
    }
    #[test]
    fn size_conflict_prevents_equal_hash_match() {
        let h = hash(b"abc");
        let mut d = rec("d", "a", Some(&h));
        d.size = Some(4);
        assert_eq!(
            reconcile(request(vec![rec("s", "a", Some(&h))], vec![d]))
                .unwrap()
                .findings[0]
                .status,
            "changed"
        );
    }
    #[test]
    fn duplicate_hash_is_ambiguous() {
        let h = hash(b"abc");
        assert_eq!(
            reconcile(request(
                vec![rec("s", "a", Some(&h))],
                vec![rec("d", "a", Some(&h)), rec("d2", "b", Some(&h))]
            ))
            .unwrap()
            .findings[0]
                .status,
            "ambiguous"
        );
    }
    #[test]
    fn source_duplicates_cannot_share_one_destination() {
        let h = hash(b"abc");
        let r = reconcile(request(
            vec![rec("s1", "a", Some(&h)), rec("s2", "b", Some(&h))],
            vec![rec("d", "c", Some(&h))],
        ))
        .unwrap();
        assert!(r.findings.iter().all(|f| f.status == "ambiguous"));
    }
    #[test]
    fn empty_manifests_are_valid_without_completeness_claim() {
        let r = reconcile(request(vec![], vec![])).unwrap();
        assert_eq!(r.source_count, 0);
        assert!(!r.can_recommend_source_deletion);
    }
    #[test]
    fn invalid_completeness_claim_rejected() {
        let mut q = request(vec![], vec![]);
        q.source.completeness = "entire_iphone".into();
        assert!(reconcile(q).is_err());
    }
    #[test]
    fn duplicate_id_rejected() {
        assert!(
            reconcile(request(
                vec![rec("s", "a", None), rec("s", "b", None)],
                vec![]
            ))
            .is_err()
        );
    }
    #[test]
    fn traversal_rejected() {
        assert!(reconcile(request(vec![rec("s", "../a", None)], vec![])).is_err());
    }
    #[test]
    fn relationship_original_missing() {
        let mut s = rec("s", "a", None);
        s.kind = "edited".into();
        s.original_id = Some("missing".into());
        let mut d = s.clone();
        d.id = "d".into();
        d.original_id = Some("other".into());
        assert_eq!(
            reconcile(request(vec![s], vec![d])).unwrap().findings[0].relationship,
            "original not reconciled"
        );
    }
    #[test]
    fn album_missing_metadata_unknown() {
        let mut s = rec("s", "a", None);
        s.albums = Some(vec!["Holiday".into()]);
        let mut d = rec("d", "a", None);
        d.metadata = None;
        let f = reconcile(request(vec![s], vec![d]))
            .unwrap()
            .findings
            .remove(0);
        assert_eq!(f.albums, "missing associations");
        assert_eq!(f.metadata, "unknown");
    }
    #[test]
    fn destination_extras_visible() {
        let r = reconcile(request(vec![], vec![rec("d", "a", None)])).unwrap();
        assert_eq!(r.destination_only, vec!["d"]);
    }
    #[test]
    fn schema_rejects_provenance_injection() {
        let s = r#"{"source":{"schema_version":1,"label":"a","completeness":"unknown","records":[],"verified":true},"destination":{"schema_version":1,"label":"b","completeness":"unknown","records":[]}}"#;
        assert!(reconcile_json(s).contains("unknown field"));
    }
    #[test]
    fn limit_rejected() {
        let s = (0..2001)
            .map(|i| rec(&i.to_string(), &i.to_string(), None))
            .collect();
        assert!(reconcile(request(s, vec![])).is_err());
    }
    #[test]
    fn invalid_hash_rejected() {
        assert!(reconcile(request(vec![rec("s", "a", Some("path-hash"))], vec![])).is_err());
    }
    #[test]
    fn obs_size_limit() {
        let mut q = request(vec![rec("s", "a", None)], vec![]);
        q.source_observations.push(Observation {
            id: "s".into(),
            sha256: hash(b"a"),
            size: MAX_FILE_BYTES as u64 + 1,
        });
        assert!(reconcile(q).is_err());
    }
    #[test]
    fn case_normalized_hashes() {
        let h = hash(b"abc");
        assert_eq!(
            reconcile(request(
                vec![rec("s", "a", Some(&h.to_uppercase()))],
                vec![rec("d", "a", Some(&h))]
            ))
            .unwrap()
            .findings[0]
                .status,
            "reported"
        );
    }
    #[test]
    fn mixed_hash_and_path_double_claim_is_ambiguous() {
        let input = include_str!("../tests/fixtures/phototrace-double-claim.json");
        let q: Request = serde_json::from_str(input).unwrap();
        let report = reconcile(q).unwrap();
        assert!(
            report
                .findings
                .iter()
                .all(|f| f.status == "ambiguous" && f.relationship == "unknown")
        );
    }
    #[test]
    fn cyclic_edits_are_not_originals() {
        let input = include_str!("../tests/fixtures/phototrace-cyclic-originals.json");
        let q: Request = serde_json::from_str(input).unwrap();
        let report = reconcile(q).unwrap();
        assert!(
            report
                .findings
                .iter()
                .all(|f| f.relationship == "invalid original reference")
        );
    }
    #[test]
    fn valid_original_edit_pairs_remain_covered() {
        let mut a = rec("s-original", "original", Some(&hash(b"abc")));
        let mut b = rec("s-edit", "edit", Some(&hash(b"def")));
        b.kind = "edited".into();
        b.original_id = Some(a.id.clone());
        let mut c = a.clone();
        c.id = "d-original".into();
        let mut d = b.clone();
        d.id = "d-edit".into();
        d.original_id = Some(c.id.clone());
        let result = reconcile(request(
            vec![a.clone(), b.clone()],
            vec![c.clone(), d.clone()],
        ))
        .unwrap();
        assert_eq!(result.findings[1].relationship, "covered");
        a.original_id = Some("bad-chain".into());
        let result = reconcile(request(vec![a, b], vec![c, d])).unwrap();
        assert!(
            result
                .findings
                .iter()
                .all(|f| f.relationship == "invalid original reference")
        );
    }
}
