import os
from typing import List, Dict, Any

import requests
import streamlit as st

SEARXNG_URL = os.getenv("SEARXNG_URL", "http://searxng:8080")


def search_searxng(query: str) -> List[Dict[str, Any]]:
    params = {
        "q": query,
        "format": "json",
    }
    response = requests.get(f"{SEARXNG_URL}/search", params=params, timeout=10)
    response.raise_for_status()
    payload = response.json()
    return payload.get("results", [])


st.set_page_config(page_title="SearXNG Browser", page_icon="🔎")
st.title("Minimal SearXNG Browser")
st.write("Введите запрос для поиска через SearXNG и получите результаты ниже.")

with st.form("search"):
    query = st.text_input("Поисковый запрос", placeholder="например, новости")
    submitted = st.form_submit_button("Искать")

if submitted:
    if not query:
        st.warning("Пожалуйста, введите текст запроса.")
    else:
        with st.spinner("Выполняю поиск..."):
            try:
                results = search_searxng(query)
            except Exception as exc:
                st.error(f"Не удалось получить результаты: {exc}")
            else:
                if not results:
                    st.info("Результатов не найдено.")
                else:
                    for item in results:
                        title = item.get("title") or "Без названия"
                        url = item.get("url") or ""
                        content = item.get("content") or ""
                        st.markdown(f"### [{title}]({url})" if url else f"### {title}")
                        if content:
                            st.write(content)
                        if url:
                            st.caption(url)
                        st.divider()
