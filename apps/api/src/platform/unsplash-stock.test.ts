import { describe, expect, it, vi } from "vitest";
import { findUnsplashStock, trackUnsplashSelection } from "./unsplash-stock.js";
const validPhoto={
  id:"sample-photo-1",width:2200,height:1400,
  alt_description:"Artisan sourdough bread on a bakery counter",
  urls:{regular:"https://images.unsplash.com/photo-123?view=regular",small:"https://images.unsplash.com/photo-123?view=small"},
  user:{name:"Photo Artist",links:{html:"https://unsplash.com/@photoartist"}},
  links:{html:"https://unsplash.com/photos/sample-photo-1",download_location:"https://api.unsplash.com/photos/sample-photo-1/download"},
};
describe("Unsplash compliance adapter",()=>{
  it("does not send requests without a server-side access key",async()=>{
    const fetcher=vi.fn();
    expect(await findUnsplashStock("bakery",undefined,fetcher as unknown as typeof fetch)).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("uses only public intent queries, hotlinks, stores attribution and deduplicates",async()=>{
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({results:[validPhoto,validPhoto]}),{
      status:200,headers:{"x-ratelimit-remaining":"41"},
    })) as unknown as typeof fetch;
    const photos=await findUnsplashStock("bakery","demo-test-key",fetcher);
    expect(photos).toHaveLength(1);
    expect(photos[0]?.media.provenance.sourceType).toBe("licensed-stock");
    expect(photos[0]?.media.provenance.photographer).toBe("Photo Artist");
    expect(photos[0]?.media.url.startsWith("https://images.unsplash.com/")).toBe(true);
    expect(fetcher).toHaveBeenCalled();
    const used=fetcher as unknown as ReturnType<typeof vi.fn>;
    for(const args of used.mock.calls){
      const request=new URL(String(args[0]));
      expect(request.hostname).toBe("api.unsplash.com");
      expect(request.searchParams.get("query")).not.toContain("secret business");
    }
  });
  it("tracks selected image events and fails closed on provider rejection",async()=>{
    const item={id:"sample-photo-2",downloadLocation:"https://api.unsplash.com/photos/sample-photo-2/download",media:{
      url:"https://images.unsplash.com/photo-123",alt:"Bakery",role:"feature" as const,treatment:"none" as const,
      provenance:{sourceType:"licensed-stock" as const,provider:"Unsplash",license:"Unsplash License",reviewStatus:"unreviewed" as const}
    }};
    const accept=vi.fn(async()=>new Response("{}",{status:200})) as unknown as typeof fetch;
    expect(await trackUnsplashSelection([item],"demo-test-key",accept)).toBe(true);
    const reject=vi.fn(async()=>new Response("{}",{status:429})) as unknown as typeof fetch;
    expect(await trackUnsplashSelection([item],"demo-test-key",reject)).toBe(false);
    expect(await trackUnsplashSelection([item],undefined,accept)).toBe(false);
  });
});
