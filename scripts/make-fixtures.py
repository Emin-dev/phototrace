import json, hashlib, pathlib
root=pathlib.Path(__file__).resolve().parents[1]
def h(v): return hashlib.sha256(v.encode()).hexdigest()
def rec(i,path,content=None,kind='original',albums=None,metadata=None,original_id=None,path_hash=None):
 return dict(id=i,path=path,size=len(content.encode()) if content else None,sha256=h(content) if content else None,path_hash=path_hash,kind=kind,original_id=original_id,albums=albums,metadata=metadata)
s=[
rec('s1','2025/IMG_0421.HEIC','SYNTHETIC coastal morning fixture\n',albums=['Summer, 2025'],metadata={'captured_at':'2025-07-12T08:14:00Z'}),
rec('s2','2025/IMG_0422.HEIC','SYNTHETIC hillside fixture\n',albums=['Summer, 2025'],metadata={'captured_at':'2025-07-12T09:30:00Z'}),
rec('s3','2025/IMG_0423.MOV','SYNTHETIC missing video fixture\n',albums=['Summer, 2025'],metadata={}),
rec('s4','2025/IMG_0424.HEIC','SYNTHETIC original portrait fixture\n',albums=[],metadata={}),
rec('s5','2025/IMG_0425.HEIC','SYNTHETIC lake fixture\n',albums=[],metadata={}),
rec('s6','2025/IMG_0426.HEIC',None,albums=None,metadata=None,path_hash=h('2025/IMG_0426.HEIC')),
rec('s7','2025/IMG_0426-edited.JPG','SYNTHETIC edited image fixture\n',kind='edited',original_id='s6',albums=['Favorites'],metadata={}),
rec('s8','2025/IMG_0427.HEIC','SYNTHETIC lighthouse fixture\n',albums=[],metadata={})]
d=[
rec('d1','Library/coast.HEIC','SYNTHETIC coastal morning fixture\n',albums=['Summer, 2025'],metadata={'captured_at':'2025-07-12T08:14:00Z'}),
rec('d2','Library/hills.HEIC','SYNTHETIC hillside fixture\n',albums=[],metadata={'captured_at':'2025-07-12T10:30:00Z'}),
rec('d4','2025/IMG_0424.HEIC','SYNTHETIC transformed portrait fixture\n',albums=[],metadata={}),
rec('d5','Library/lake.HEIC','SYNTHETIC lake fixture\n',albums=[],metadata={}),
rec('d5b','Library/lake-copy.HEIC','SYNTHETIC lake fixture\n',albums=[],metadata={}),
rec('d6','2025/IMG_0426.HEIC',None,albums=None,metadata=None,path_hash=h('2025/IMG_0426.HEIC')),
rec('d7','Library/edited.JPG','SYNTHETIC edited image fixture\n',kind='edited',original_id='not-supplied-original',albums=['Favorites'],metadata={}),
rec('d8','Library/lighthouse.HEIC','SYNTHETIC lighthouse fixture\n',albums=[],metadata={}),
rec('d9','Library/extra.HEIC','SYNTHETIC destination-only fixture\n',albums=[],metadata={})]
source=dict(schema_version=1,label='Summer archive export',completeness='partial',records=s)
dest=dict(schema_version=1,label='Destination library export',completeness='supplied_export',records=d)
payloads={'source':{'s1':'SYNTHETIC coastal morning fixture\n','s2':'SYNTHETIC hillside fixture\n','s7':'SYNTHETIC edited image fixture\n'},'destination':{'d1':'SYNTHETIC coastal morning fixture\n','d2':'SYNTHETIC hillside fixture\n','d7':'SYNTHETIC edited image fixture\n'}}
(root/'fixtures/source.json').write_text(json.dumps(source,indent=2)+'\n')
(root/'fixtures/destination.json').write_text(json.dumps(dest,indent=2)+'\n')
(root/'public/sample.json').write_text(json.dumps({'source':source,'destination':dest,'synthetic_payloads':payloads},indent=2)+'\n')
