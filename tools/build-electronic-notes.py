"""Split supplied PDFs at their existing chapter bookmarks; never retypeset pages."""
from pathlib import Path
from pypdf import PdfReader,PdfWriter
import json,hashlib,sys
sys.stdout.reconfigure(encoding='utf-8')
root=Path(__file__).resolve().parents[1];source=Path(r'E:\考研\光学')
dest=root/'assets/notes';dest.mkdir(parents=True,exist_ok=True)
chapters=json.loads((root/'data/chapters.json').read_text(encoding='utf-8-sig'))['chapters']
byid={c['id']:c for c in chapters}
sources={name:PdfReader(source/name) for name in ['几何光学.pdf','物理光学.pdf']}
spec=[
 ('geom-ch1','几何光学.pdf',2,7),('geom-ch2','几何光学.pdf',8,14),
 ('geom-ch3','几何光学.pdf',15,19),('geom-ch4','几何光学.pdf',20,24),
 ('geom-ch5','几何光学.pdf',25,29),('geom-ch6','几何光学.pdf',30,34),
 ('instruments','几何光学.pdf',35,70),
 ('phys-ch9','物理光学.pdf',1,16),('phys-ch10','物理光学.pdf',17,31),
 ('phys-ch11','物理光学.pdf',32,45),('phys-ch12','物理光学.pdf',46,58),
 ('phys-ch13','物理光学.pdf',59,79)
]
manifest={'version':1,'description':'按原 PDF 章节拆分，保留原版文字、公式和图示。','sources':[],'chapters':[]}
for name,reader in sources.items():manifest['sources'].append({'name':name,'pages':len(reader.pages),'sha256':hashlib.sha256((source/name).read_bytes()).hexdigest()})
for key,name,start,end in spec:
 reader=sources[name];writer=PdfWriter()
 for i in range(start-1,end):writer.add_page(reader.pages[i])
 title=byid[key]['title'] if key in byid else '光学仪器'
 writer.add_metadata({'/Title':title,'/Subject':f'{name} · 原 PDF 第 {start}–{end} 页'})
 # Keep only destinations inside this part; replace container bookmarks with the chapter title.
 top=writer.add_outline_item(title,0)
 def add_outline(items,parent):
  latest=parent
  for item in items:
   if isinstance(item,list):add_outline(item,latest)
   else:
    pos=reader.get_destination_page_number(item)+1
    if start<=pos<=end and item.title!=title:
     latest=writer.add_outline_item(item.title,pos-start,parent=parent)
    else:latest=parent
 add_outline(reader.outline,top)
 file=dest/(key+'.pdf')
 with file.open('wb') as f:writer.write(f)
 check=PdfReader(file);assert len(check.pages)==end-start+1
 # Content streams and media boxes must be unchanged, including first/last pages.
 for i,page in enumerate(check.pages):
  original=reader.pages[start-1+i]
  assert page.get_contents().get_data()==original.get_contents().get_data()
  assert page.mediabox==original.mediabox
 related=[{'id':key,'label':byid[key]['num']+' '+title,'page':1}] if key in byid else []
 if key=='instruments':
  for cid,pos in [('inst-c2',49),('inst-c3',56),('inst-c4',58),('inst-c5',60),('inst-c6',62),('inst-c7',64),('inst-c10',67),('inst-c11',69)]:
   related.append({'id':cid,'label':byid[cid]['num']+' '+byid[cid]['title'],'page':pos-start+1})
 manifest['chapters'].append({'id':key,'title':title,'label':byid[key]['num'] if key in byid else '光学仪器','group':'物理光学' if key.startswith('phys') else '光学仪器' if key=='instruments' else '几何光学','source':name,'sourceStart':start,'sourceEnd':end,'pages':len(check.pages),'bytes':file.stat().st_size,'url':'assets/notes/'+file.name,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'relatedChapters':related})
 print(key,start,end,len(check.pages),file.stat().st_size)
assert sum(c['pages'] for c in manifest['chapters'])==148
(root/'data/electronic-notes.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('12 chapter PDFs validated; original geometry contents page 1 is represented by the chapter list.')
