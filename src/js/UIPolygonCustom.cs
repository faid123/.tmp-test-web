using System.Collections;
using System.Collections.Generic;
using UnityEngine;

/// <summary>
/// Unity UI Extension
/// </summary>
namespace UnityEngine.UI.Extensions
{
    [AddComponentMenu("UI/Extensions/Primitives/UI Polygon")]
    public class UIPolygonCustom : MaskableGraphic
    {
        [SerializeField]
        Texture m_Texture;
        public bool fill = true;
        public float thickness = 5;
        [Range(3, 360)]
        public int sides = 3;
        [Range(0, 360)]
        public float rotation = 0;

        private float size = 0;

        [SerializeField]
        public List<GameObject> Points = new List<GameObject>();
        public override Texture mainTexture {
            get {
                return m_Texture == null ? s_WhiteTexture : m_Texture;
            }
        }
        public Texture texture {
            get {
                return m_Texture;
            }
            set {
                if (m_Texture == value) return;
                m_Texture = value;
                SetVerticesDirty();
                SetMaterialDirty();
            }
        }
        protected UIVertex[] SetVbo(Vector2[] vertices, Vector2[] uvs)
        {
            UIVertex[] vbo = new UIVertex[4];
            for (int i = 0; i < vertices.Length; i++)
            {
                var vert = UIVertex.simpleVert;
                vert.color = color;
                vert.position = vertices[i];
                vert.uv0 = uvs[i];
                vbo[i] = vert;
            }
            return vbo;
        }
        protected override void OnPopulateMesh(VertexHelper vh)
        {
            vh.Clear();
            sides = Points.Count;
            Vector2 prevX = Vector2.zero;
            Vector2 prevY = Vector2.zero;
            Vector2 uv0 = new Vector2(0, 0);
            Vector2 uv1 = new Vector2(0, 1);
            Vector2 uv2 = new Vector2(1, 1);
            Vector2 uv3 = new Vector2(1, 0);
            Vector2 pos0;
            Vector2 pos1;
            Vector2 pos2;
            Vector2 pos3;
            float degrees = 360f / sides;
            int vertices = sides + 1;
            /*if (VerticesDistances.Length != vertices)
            {
                VerticesDistances = new float[vertices];
                for (int i = 0; i < vertices - 1; i++) VerticesDistances[i] = 1;
            }
            // last vertex is also the first!
            VerticesDistances[vertices - 1] = VerticesDistances[0];
            */
            for (int i = 0; i < vertices-1; i++)
            {
                //float outer = -rectTransform.pivot.x * size * VerticesDistances[i];
                //float inner = -rectTransform.pivot.x * size * VerticesDistances[i] + thickness;
                float rad = Mathf.Deg2Rad * (i * degrees + rotation);
                float c = Mathf.Cos(rad);
                float s = Mathf.Sin(rad);
                uv0 = new Vector2(0, 1);
                uv1 = new Vector2(1, 1);
                uv2 = new Vector2(1, 0);
                uv3 = new Vector2(0, 0);
                pos0 = prevX;
                //pos1 = new Vector2(outer * c, outer * s);
                pos1 = new Vector2(Points[i].GetComponent<RectTransform>().localPosition.x, Points[i].GetComponent<RectTransform>().localPosition.y);
                if (fill)
                {
                    pos2 = Vector2.zero;
                    pos3 = Vector2.zero;
                }
                else
                {
                    //pos2 = new Vector2(inner * c, inner * s);
                    pos2 = new Vector2(Points[i].GetComponent<RectTransform>().localPosition.x, Points[i].GetComponent<RectTransform>().localPosition.y);
                    pos3 = prevY;
                }
                prevX = pos1;
                prevY = pos2;
                vh.AddUIVertexQuad(SetVbo(new[] { pos0, pos1, pos2, pos3 }, new[] { uv0, uv1, uv2, uv3 }));
            }
        }
    }
}