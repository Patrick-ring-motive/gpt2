[Request, Response, Blob].forEach(res => {
  res.prototype.bytes ??= async function bytes() {
    return new Uint8Array(await this.arrayBuffer());
  };
});
if (!new Request("https://test.com", { method: "POST", body: "test" }).body) {
  Object.defineProperty(Request.prototype, "body", {
    get() {
      const $this = this;
      return new ReadableStream({
        async pull(controller) {
          controller.enqueue(await $this.bytes());
          controller.close();
        },
      });
    },
  });
}
ReadableStream.prototype[Symbol.asyncIterator] ??=
  async function* asyncIterator() {
    const reader = this?.getReader?.();
    try {
      let chunk = await reader.read();
      while (chunk?.done === false) {
        yield chunk?.value;
        chunk = await reader?.read?.();
      }
    } finally {
      reader?.releaseLock?.();
    }
  };

globalThis.requestAnimationFrame ??= (fn) => setTimeout(fn, 0);
globalThis.requestIdleCallback ??= globalThis.requestAnimationFrame;

globalThis.cancelAnimationFrame ??= (id) => clearTimeout(id);
globalThis.cancelIdleCallback ??= globalThis.cancelAnimationFrame;

const context = [];
(async () => {

  const { pipeline, TextStreamer } = await import('../transformers.js');
  globalThis.pipeline = pipeline;
  globalThis.TextStreamer = TextStreamer;
  console.log(TextStreamer);
  (() => {
    const _fetch = globalThis.fetch;
    const fetchChunk = async (url) => {
      const response = await _fetch(url);
      const bytes = await response.bytes();
      return bytes;
    };

    const fetchText = async (url) => {
      const response = await _fetch(url);
      const text = await response.text();
      return text;
    };

    const cache = {
      async init() {
        if (!cache.box) {
          cache.box = caches.open('chunk-cache');
        }
        if (cache.box instanceof Promise) {
          cache.box = await cache.box;
        }
        return cache.box;
      },
      async get(key) {
        await this.init();
        return (await this.box.match(key))?.clone?.();
      },
      async set(key, value) {
        await this.init();
        return await this.box.put(key, (await value)?.clone?.());
      },
      async delete(key) {
        await this.init();
        return await this.box.delete(key);
      },
      async matchAll(filter) {
        filter ??= () => true;
        await this.init();
        return [...(await this.box.matchAll())].filter(x => filter(x.url));
      },
      async keys(filter) {
        filter ??= () => true;
        await this.init();
        return [...(await this.box.keys())].filter(x => filter(x.url));
      },
      async deleteAll(filter) {
        filter ??= () => true;
        await this.init();
        return await Promise.all((await this.keys(filter)).map(x => this.delete(x.url ?? x)));
      }
    };



    const cacheText = async (url) => {
      const cached = await cache.get(url);
      if (cached) {
        return await cached.clone().text();
      }
      const response = await _fetch(url);
      if (!response.ok){
        throw new Error(`Failed to fetch ${url} ${response.statusText}`);
      }
      cache.set(url, response.clone());
      const text = await response.text();
      return text;
    };

    const decode64 = (b64) => {
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      const len = binary.length;
      for (let i = 0; i !== len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    };

    const loc = location.href.split('/');
    loc.pop();
    const root = loc.join('/');

    const fetchB64Encoder = async () => {
      const chunks = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(x => cacheText(`${root}/code_chunks/encoder${x}.txt`));
      const data = (await Promise.all(chunks)).join('');
      const res = new Response(decode64(data));
      cache.deleteAll(x => x.includes('encoder'));
      return res;
    };

    const fetchB64Decoder = async () => {
      const chunks = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(x => cacheText(`${root}/code_chunks/decoder${x}.txt`));
      const data = (await Promise.all(chunks)).join('');
      const res = new Response(decode64(data));
      cache.deleteAll(x => x.includes('decoder'));
      return res;
    };


    globalThis.fetch = async function fetch() {
      if (String(arguments[0]).endsWith('ort-wasm-simd-threaded.jsep.wasm')) {
      //  return new Response((await _fetch(`${root}/ort-wasm-simd-threaded.jsep.wasm.gz`)).body.pipeThrough(new DecompressionStream("gzip")), { headers: { "content-type": "application/wasm" } });
      }
      if (String(arguments[0]).endsWith('tokenizer_config.json')) {
      //  return new Response((await _fetch(`${root}/tokenizerconfigjson.gz`)).body.pipeThrough(new DecompressionStream("gzip")));
      }
      if (String(arguments[0]).endsWith('config.json')) {
     //   return new Response((await _fetch(`${root}/configjson.gz`)).body.pipeThrough(new DecompressionStream("gzip")));
      }
      if (String(arguments[0]).endsWith('tokenizer.json')) {
      //  return new Response((await _fetch(`${root}/tokenizerjson.gz`)).body.pipeThrough(new DecompressionStream("gzip")));
      }
      if (String(arguments[0]).includes('encoder')) {
    //    return await fetchB64Encoder();
      }
      if (String(arguments[0]).includes('decoder')) {
       // return await fetchB64Decoder();
      }
      return _fetch.apply(this, arguments);
    };
  })();
  self.log = (msg) => {
    self.postMessage(msg);
  };

  // Create a text generation pipeline
  let generator;
  try {

     generator = await pipeline(
      "text-generation",
      "Xenova/distilgpt2",
    );

    // Generate text

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Generate text
    const genNext = async (txt) => {
      const streamer = new TextStreamer(generator.tokenizer, {
        skip_prompt: true,
        callback_function: (token) => {
          log(token);
          context.push(token);
        }
      });
      const output = await generator(txt, {
        max_length: 64,
        do_sample: true,
        top_k: 10,
        streamer
      });
    };
    self.onmessage = async (event) => await genNext(event.data);
  } catch (e) {
    log(e);
  }

  postMessage('ready');
})();