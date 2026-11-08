import json,sys,os,io,hashlib,struct
from PIL import Image
root,lst=sys.argv[1],sys.argv[2]
files=[];miss=0
for p in json.load(open(lst)):
    f=os.path.join(root,p)
    if not os.path.exists(f) or not p.lower().endswith(('.webp','.png','.jpg','.jpeg')): miss+=1; continue
    try:
        im=Image.open(f); im.load()
        if im.mode in ('RGBA','LA','P'):
            im=im.convert('RGBA'); bg=Image.new('RGB',im.size,'white'); bg.paste(im,mask=im.split()[3]); im=bg
        else: im=im.convert('RGB')
        im.thumbnail((220,220))
        b=io.BytesIO(); fmt={'webp':'WEBP','png':'PNG','jpg':'JPEG','jpeg':'JPEG'}[p.rsplit('.',1)[1].lower()]
        if fmt=='PNG': im.save(b,'PNG',optimize=True)
        else: im.save(b,fmt,quality=50)
        files.append((p,b.getvalue()))
    except Exception as e: miss+=1
body=b''.join(d for _,d in files)
rev=hashlib.sha1(body).hexdigest()[:16]
head=json.dumps({'revision':rev,'files':[[p,len(d)] for p,d in files]},separators=(',',':')).encode()
pack=b'TSSPACK1'+struct.pack('>I',len(head))+head+body
open(os.path.join(root,'offline-pack.bin'),'wb').write(pack)
st=json.load(open(os.path.join(root,'catalog-status.json')))
st.update(offlineBytes=len(pack),packBytes=len(pack),packRevision=rev,packPhotos=len(files))
json.dump(st,open(os.path.join(root,'catalog-status.json'),'w'))
print('photos',len(files),'miss',miss,'bytes',len(pack),'rev',rev)
