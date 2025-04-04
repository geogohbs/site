//// @ts-check
// import blank from '/blank.jpg';

// pdfjsLib.GlobalWorkerOptions.workerSrc =
// 	'node_modules/pdfjs-dist/build/pdf.worker.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc =
	'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.worker.min.mjs';

const url = `https://materials.hbs.geogo.org/bulletins/${
	window.location.search.substring(1) ?? 'blank'
}.pdf`;

// const url = 'bulletin.pdf';

const pdfViewer = document.querySelector('#pdf-viewer');
/** @type {HTMLCanvasElement} */
const canvas1 = document.querySelector('#can-1');
/** @type {HTMLCanvasElement} */
const canvas2 = document.querySelector('#can-2');
const pageSlider = document.getElementById('page-slider');
const prevBtn = document.getElementById('prev');
const nextBtn = document.getElementById('next');
const pageNumElem = document.getElementById('page-num');
const loading = document.getElementById('loading');
const passwordDialog = document.querySelector('dialog');
const passwordInput = document.querySelector('#password');
const passwordButton = document.querySelector('#password-btn');

const minHeight = 500;
const sqrt2 = 1.4142135624;
const revSqrt2 = 0.7071067812;
const verticalMargin = 80;
const horizontalMargin = 24;

/** @type {import("pdfjs-dist").PDFDocumentProxy} */
let pdf = null;
let pdfMeta = null;
let currentPage = 0;
let pageRendering = false;
let pageNumPending = null;
let timerWindowSize = null;
let timerZoom = null;
let pagePerWindow = window.innerWidth >= 800 ? 2 : 1;
let scale = null;
let zoomLevel = 1.0;
let pageHeight;
let pageWidth;
let viewPageHeight;
let viewPageWidth;
let isMouseOn = false;
let password;
let preMousePosX = null;
/** @type {import("pdfjs-dist").RenderTask} */
let renderTask1 = null;
/** @type {import("pdfjs-dist").RenderTask} */
let renderTask2 = null;

async function start() {
	password = window.localStorage.getItem('pw');

	const pdfPromise = pdfjsLib.getDocument({
		url,
		password: password,
		// cMapUrl: 'node_modules/pdfjs-dist/cmaps/',
		cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/cmaps/',
		disableFontFace: true,
	}).promise;

	try {
		pdf = await pdfPromise;
		document.body.removeChild(loading);

		startRender();
	} catch (e) {
		console.log(e.message);

		if (e.message !== 'No password given' && e.message !== 'Incorrect Password') {
			alert('잘못된 접근');
			return;
		}

		passwordDialog.showModal();

		passwordButton.addEventListener('click', questPassword);
		passwordInput.addEventListener('keydown', function (e) {
			if (e.key === 'Enter') questPassword();
		});
	}
}

async function renderSinglePage(pageNum, target = 1) {
	pageRendering = true;

	if (pagePerWindow === 1) {
		canvas2.style.display = 'none';
	} else {
		canvas2.style.display = 'block';
	}
	canvas1.style.display = 'block';

	if (pageNum === 0 || pageNum === pdf.numPages + 1) {
		const canvas = pageNum === 0 ? canvas1 : canvas2;
		const ctx = canvas.getContext('2d');

		const img = new Image();
		const outputScale = window.devicePixelRatio || 1;

		canvas.width = Math.floor(pageWidth * outputScale);
		canvas.height = Math.floor(pageWidth * sqrt2 * outputScale);

		canvas.style.width = Math.floor(pageWidth * scale) + 'px';
		canvas.style.height = Math.floor(pageWidth * sqrt2 * scale) + 'px';

		img.src = './blank.jpg';
		// img.src = blank;
		img.addEventListener('load', () => {
			ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

			if (target === pagePerWindow) pageRendering = false;
		});

		if (pagePerWindow === 1 && target === 1) {
			pageNumElem.textContent = pageNum + ' / ' + pdf.numPages;
		} else if (pagePerWindow === 2 && target === 1) {
			pageNumElem.textContent = `${pageNum}-${pageNum + 1} / ${pdf.numPages}`;
		}

		return;
	}

	const canvas = target === 1 ? canvas1 : canvas2;
	const canvasContext = canvas.getContext('2d');
	canvasContext.clearRect(0, 0, canvas.width, canvas.height);
	canvasContext.resetTransform();
	canvasContext.translate(0, 0);
	canvasContext.rotate(0);
	// canvas.appendChild(loading);
	const page = await pdf.getPage(pageNum);
	const viewport = page.getViewport({
		scale: scale * zoomLevel,
	});
	const outputScale = window.devicePixelRatio || 1;

	canvas.width = Math.floor(viewport.width * outputScale);
	canvas.height = Math.floor(viewport.height * outputScale);

	canvas.style.width = Math.floor(viewport.width / zoomLevel) + 'px';
	canvas.style.height = Math.floor(viewport.height / zoomLevel) + 'px';

	const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;
	const renderContext = { canvasContext, transform, viewport };

	if (target === 1) {
		renderTask1 = page.render(renderContext);
	} else {
		renderTask2 = page.render(renderContext);
	}
	// renderTask = page.render(renderContext);

	if (target === 1) {
		if (pagePerWindow === 1) {
			pageNumElem.textContent = pageNum + ' / ' + pdf.numPages;
		} else if (pagePerWindow === 2 && pageNum === pdf.numPages) {
			pageNumElem.textContent = `${pageNum}-END / ${pdf.numPages}`;
		} else if (pagePerWindow === 2) {
			pageNumElem.textContent = `${pageNum}-${pageNum + 1} / ${pdf.numPages}`;
		}
	}

	if (target === 1) {
		try {
			await renderTask1.promise;
		} catch (e) {
			console.log(e);
		}
	} else {
		try {
			await renderTask2.promise;
		} catch (e) {
			console.log(e);
		}
	}

	if (target === pagePerWindow) pageRendering = false;

	if (target === 1) {
		renderTask1 = null;
	} else {
		renderTask2 = null;
	}
}

async function renderPages(num) {
	console.log('Render');
	// resize시 window와 window.visualViewport에서 둘다 렌더링 시도하여 오류남. 오류 안나도록 한 쪽 요청은 무시
	if (pageRendering) {
		console.log('Rendering in renderPages');
		return;
	}

	if (pagePerWindow === 1) {
		await renderSinglePage(num, 1);
	} else if (pagePerWindow === 2) {
		await renderSinglePage(num, 1);
		await renderSinglePage(num + 1, 2);
	} else {
		console.log('What the heck?');
	}
}

async function onPrevPage() {
	if (pageRendering) {
		console.log('Rendering...');
		return;
	}
	if (currentPage <= (pagePerWindow === 2 ? 0 : 1)) {
		console.log('Page staring');
		return;
	}
	currentPage -= pagePerWindow;
	pageSlider.value = currentPage;
	await renderPages(currentPage);
}

async function onNextPage() {
	if (pageRendering) {
		console.log('Rendering...');
		return;
	}
	if (currentPage >= pdf.numPages) {
		console.log('Page end');
		return;
	}
	currentPage += pagePerWindow;
	pageSlider.value = currentPage;
	await renderPages(currentPage);
}

async function questPassword() {
	console.log(password);
	password = passwordInput.value;

	const pdfPromise = pdfjsLib.getDocument({
		url,
		password: password,
		cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/cmaps/',
		disableFontFace: true,
	}).promise;

	try {
		pdf = await pdfPromise;
		window.localStorage.setItem('pw', password);
		document.body.removeChild(loading);

		startRender();

		passwordDialog.close();
	} catch (e) {
		console.log(e.message);
		passwordInput.value = '';
		alert('비밀번호가 틀렸습니다.');
	}
}

function startRender() {
	pdf.getPage(1).then(async (page) => {
		const viewport = page.getViewport({ scale: 1.0 });
		pageWidth = viewport.width;
		pageHeight = viewport.height;
		scale = (window.innerHeight - verticalMargin) / pageHeight;
		pagePerWindow = pageWidth * scale * 2 < window.innerWidth ? 2 : 1;
		scale =
			pageWidth * scale < window.innerWidth
				? scale
				: (window.innerWidth - horizontalMargin) / pageWidth;

		pageSlider.max = pdf.numPages;
		currentPage = pagePerWindow === 2 ? 0 : 1;

		await renderPages(currentPage);

		prevBtn.addEventListener('click', onPrevPage);
		nextBtn.addEventListener('click', onNextPage);

		/// 밀어서 페이지 넘기기
		pdfViewer.addEventListener('mousedown', function (e) {
			preMousePosX = e.clientX;
			console.log(preMousePosX);
		});
		pdfViewer.addEventListener('mouseup', async function (e) {
			if (e.clientX - preMousePosX < -12) await onNextPage();
			else if (e.clientX - preMousePosX > 12) await onPrevPage();
		});
		pdfViewer.addEventListener('touchstart', function (e) {
			if (e.targetTouches.length === 1) {
				preMousePosX = e.targetTouches[0].clientX;
				console.log(preMousePosX);
			} else {
				preMousePosX = null;
			}

			console.log('touch');
		});
		pdfViewer.addEventListener('touchend', function (e) {
			if (preMousePosX !== null) {
				if (e.changedTouches[0].clientX - preMousePosX < -12) onNextPage();
				else if (e.changedTouches[0].clientX - preMousePosX > 12) onPrevPage();
			}

			console.log(e);
		});

		window.addEventListener('resize', () => {
			clearTimeout(timerWindowSize);
			timerWindowSize = setTimeout(() => {
				pdf.getPage(1).then((page) => {
					const viewport = page.getViewport({ scale: 1.0 });
					pageWidth = viewport.width;
					pageHeight = viewport.height;
					scale = (window.innerHeight - verticalMargin) / pageHeight;
					pagePerWindow = pageWidth * scale * 2 < window.innerWidth ? 2 : 1;
					scale =
						pageWidth * scale < window.innerWidth
							? scale
							: (window.innerWidth - horizontalMargin) / pageWidth;

					if (pagePerWindow === 2) currentPage -= currentPage & 1;
					else if (pagePerWindow === 1 && currentPage === 0) currentPage = 1;

					pageSlider.max = pdf.numPages;

					renderPages(currentPage);
				});
			}, 300);
		});

		window.onkeyup = (e) => {
			if (e.key === 'ArrowRight' || e.key === ' ') {
				e.preventDefault();
				onNextPage();
			} else if (e.key === 'ArrowLeft') {
				e.preventDefault();
				onPrevPage();
			}
		};

		pageSlider.addEventListener('input', (e) => {
			if (pageRendering) return;

			let reqPage = parseInt(e.target.value);
			if (pagePerWindow === 1) {
				currentPage = reqPage;
				pageNumElem.textContent = currentPage + ' / ' + pdf.numPages;
			} else if (pagePerWindow === 2) {
				currentPage = (reqPage & 1) === 1 ? reqPage - 1 : reqPage;
				pageNumElem.textContent =
					currentPage +
					'-' +
					(currentPage !== pdf.numPages ? currentPage + 1 : 'END') +
					' / ' +
					pdf.numPages;
			}

			console.log(currentPage);
		});
		pageSlider.addEventListener('change', async (e) => {
			if (pageRendering) return;

			let reqPage = parseInt(e.target.value);
			if (pagePerWindow === 1) {
				currentPage = reqPage;
			} else if (pagePerWindow === 2) {
				currentPage = (reqPage & 1) === 1 ? reqPage - 1 : reqPage;
			}
			console.log(currentPage);
			await renderPages(currentPage);
		});

		window.visualViewport.addEventListener('resize', (e) => {
			clearTimeout(timerZoom);

			timerZoom = setTimeout(() => {
				zoomLevel = window.visualViewport.scale;
				renderPages(currentPage);
			}, 300);
		});
	});
}

start();
